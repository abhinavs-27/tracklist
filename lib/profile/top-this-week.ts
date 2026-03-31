import "server-only";

import { getRolling7dVsPrior7dBounds } from "@/lib/analytics/rolling-windows";
import type { CatalogFetchOpts } from "@/lib/spotify/catalog-read-policy";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const CATALOG_OFFLINE: CatalogFetchOpts = { allowNetwork: false };

async function fetchCatalogBatches(
  artistIds: string[],
  trackIdsTop: string[],
  albumIds: string[],
  opts: CatalogFetchOpts,
): Promise<{
  artistMetaList: Awaited<ReturnType<typeof getOrFetchArtistsBatch>>;
  trackMetaList: Awaited<ReturnType<typeof getOrFetchTracksBatch>>;
  albumMetaList: Awaited<ReturnType<typeof getOrFetchAlbumsBatch>>;
}> {
  const [artistMetaList, trackMetaList, albumMetaList] = await Promise.all([
    artistIds.length
      ? getOrFetchArtistsBatch(artistIds, opts)
      : Promise.resolve([] as Awaited<ReturnType<typeof getOrFetchArtistsBatch>>),
    trackIdsTop.length
      ? getOrFetchTracksBatch(trackIdsTop, opts)
      : Promise.resolve([] as Awaited<ReturnType<typeof getOrFetchTracksBatch>>),
    albumIds.length
      ? getOrFetchAlbumsBatch(albumIds, opts)
      : Promise.resolve([] as Awaited<ReturnType<typeof getOrFetchAlbumsBatch>>),
  ]);
  return { artistMetaList, trackMetaList, albumMetaList };
}

const TOP_N = 10;
const MAX_LOGS = 20000;

export type TopWeekTrack = {
  trackId: string;
  albumId: string;
  name: string;
  artistName: string;
  albumImageUrl: string | null;
  playCount: number;
};

export type TopWeekArtist = {
  artistId: string;
  name: string;
  imageUrl: string | null;
  playCount: number;
};

export type TopWeekAlbum = {
  albumId: string;
  name: string;
  artistName: string;
  imageUrl: string | null;
  playCount: number;
};

export type TopThisWeekResult = {
  rangeLabel: string;
  tracks: TopWeekTrack[];
  artists: TopWeekArtist[];
  albums: TopWeekAlbum[];
};

function isValidCatalogId(id: unknown): id is string {
  if (id == null || typeof id !== "string") return false;
  const t = id.trim();
  if (t.length === 0) return false;
  if (t === "null" || t === "undefined") return false;
  return true;
}

type RpcAgg = {
  tracks: { track_id: string; play_count: number }[];
  artists: { artist_id: string; play_count: number }[];
  albums: { album_id: string; play_count: number }[];
};

function parseTopWeekRpcPayload(raw: unknown): RpcAgg {
  const empty: RpcAgg = { tracks: [], artists: [], albums: [] };
  if (raw == null || typeof raw !== "object") return empty;
  const o = raw as Record<string, unknown>;

  const parseTrackRows = (): RpcAgg["tracks"] => {
    const a = o.tracks;
    if (!Array.isArray(a)) return [];
    const out: RpcAgg["tracks"] = [];
    for (const row of a) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const tid = r.track_id;
      const c = r.play_count;
      if (typeof tid !== "string" || !isValidCatalogId(tid)) continue;
      const n = typeof c === "number" ? c : Number(c);
      if (!Number.isFinite(n) || n < 0) continue;
      out.push({ track_id: tid.trim(), play_count: Math.floor(n) });
    }
    return out;
  };

  const parseArtistRows = (): RpcAgg["artists"] => {
    const a = o.artists;
    if (!Array.isArray(a)) return [];
    const out: RpcAgg["artists"] = [];
    for (const row of a) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = r.artist_id;
      const c = r.play_count;
      if (typeof id !== "string" || !isValidCatalogId(id)) continue;
      const n = typeof c === "number" ? c : Number(c);
      if (!Number.isFinite(n) || n < 0) continue;
      out.push({ artist_id: id.trim(), play_count: Math.floor(n) });
    }
    return out;
  };

  const parseAlbumRows = (): RpcAgg["albums"] => {
    const a = o.albums;
    if (!Array.isArray(a)) return [];
    const out: RpcAgg["albums"] = [];
    for (const row of a) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const id = r.album_id;
      const c = r.play_count;
      if (typeof id !== "string" || !isValidCatalogId(id)) continue;
      const n = typeof c === "number" ? c : Number(c);
      if (!Number.isFinite(n) || n < 0) continue;
      out.push({ album_id: id.trim(), play_count: Math.floor(n) });
    }
    return out;
  };

  return {
    tracks: parseTrackRows(),
    artists: parseArtistRows(),
    albums: parseAlbumRows(),
  };
}

/** `tracks.id` → `album_id` for hrefs when catalog cache has no album on the track. */
async function fetchTrackAlbumIds(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(trackIds)].filter(isValidCatalogId);
  if (unique.length === 0) return out;
  const { data, error } = await admin
    .from("tracks")
    .select("id, album_id")
    .in("id", unique);
  if (error) {
    console.warn("[top-this-week] fetchTrackAlbumIds", error.message);
    return out;
  }
  for (const row of data ?? []) {
    const r = row as { id: string; album_id: string | null };
    if (r.album_id && isValidCatalogId(r.album_id)) out.set(r.id, r.album_id.trim());
  }
  return out;
}

/**
 * Top tracks, artists, and albums over the rolling last 7 days from `logs`.
 * Aggregates in Postgres (`get_top_this_week_aggregates`); metadata from DB cache only.
 * Spotify artwork is filled client-side via `/api/profile/top-week-catalog`.
 */
export async function getTopThisWeek(userId: string): Promise<TopThisWeekResult> {
  const { current, rangeLabel } = getRolling7dVsPrior7dBounds();

  const empty = (): TopThisWeekResult => ({
    rangeLabel,
    tracks: [],
    artists: [],
    albums: [],
  });

  const uid = userId?.trim();
  if (!uid) return empty();

  const admin = createSupabaseAdminClient();

  const { data: aggRaw, error: rpcErr } = await admin.rpc("get_top_this_week_aggregates", {
    p_user_id: uid,
    p_start: current.startIso,
    p_end_exclusive: current.endExclusiveIso,
    p_top_n: TOP_N,
    p_log_cap: MAX_LOGS,
  });

  if (rpcErr) {
    console.error("[top-this-week] get_top_this_week_aggregates:", rpcErr);
    return empty();
  }

  const agg = parseTopWeekRpcPayload(aggRaw);
  if (
    agg.tracks.length === 0 &&
    agg.artists.length === 0 &&
    agg.albums.length === 0
  ) {
    return empty();
  }

  const sortedTracks = agg.tracks.map(
    (r) => [r.track_id, r.play_count] as [string, number],
  );
  const sortedArtists = agg.artists.map(
    (r) => [r.artist_id, r.play_count] as [string, number],
  );
  const sortedAlbums = agg.albums.map(
    (r) => [r.album_id, r.play_count] as [string, number],
  );

  const artistIds = sortedArtists.map(([id]) => id).filter(isValidCatalogId);
  const trackIdsTop = sortedTracks.map(([id]) => id).filter(isValidCatalogId);
  const albumIds = sortedAlbums.map(([id]) => id).filter(isValidCatalogId);

  const pass1 = await fetchCatalogBatches(
    artistIds,
    trackIdsTop,
    albumIds,
    CATALOG_OFFLINE,
  );

  const artistMetaById = new Map(
    artistIds.map((id, i) => [id, pass1.artistMetaList[i] ?? null] as const),
  );
  const trackMetaById = new Map(
    trackIdsTop.map((id, i) => [id, pass1.trackMetaList[i] ?? null] as const),
  );
  const albumMetaById = new Map(
    albumIds.map((id, i) => [id, pass1.albumMetaList[i] ?? null] as const),
  );

  const albumIdByTrackId = await fetchTrackAlbumIds(admin, trackIdsTop);

  const artists: TopWeekArtist[] = [];
  for (const [entityId, count] of sortedArtists) {
    if (!isValidCatalogId(entityId)) continue;
    const a = artistMetaById.get(entityId);
    artists.push({
      artistId: entityId,
      name: a?.name ?? entityId,
      imageUrl: a?.images?.[0]?.url ?? null,
      playCount: count,
    });
  }

  const tracks: TopWeekTrack[] = [];
  for (const [entityId, count] of sortedTracks) {
    if (!isValidCatalogId(entityId)) continue;
    const t = trackMetaById.get(entityId);
    const albumId =
      t?.album?.id?.trim() ?? albumIdByTrackId.get(entityId) ?? null;
    if (!isValidCatalogId(albumId)) continue;
    tracks.push({
      trackId: entityId,
      albumId,
      name: t?.name ?? entityId,
      artistName: t?.artists?.[0]?.name ?? "—",
      albumImageUrl: t?.album?.images?.[0]?.url ?? null,
      playCount: count,
    });
  }

  const albums: TopWeekAlbum[] = [];
  for (const [entityId, count] of sortedAlbums) {
    if (!isValidCatalogId(entityId)) continue;
    const al = albumMetaById.get(entityId);
    albums.push({
      albumId: entityId,
      name: al?.name ?? entityId,
      artistName: al?.artists?.[0]?.name ?? "—",
      imageUrl: al?.images?.[0]?.url ?? null,
      playCount: count,
    });
  }

  await enrichNamesFromCatalogTables(admin, artists, albums);

  return { rangeLabel, tracks, artists, albums };
}

function needsNameFallback(name: string, id: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (n === id) return true;
  if (n.length >= 16 && /^[0-9A-Za-z]+$/.test(n)) return true;
  return false;
}

async function enrichNamesFromCatalogTables(
  admin: SupabaseClient,
  artists: TopWeekArtist[],
  albums: TopWeekAlbum[],
): Promise<void> {
  const CHUNK = 300;
  const artistNameById = new Map<string, string>();
  const albumNameById = new Map<string, string>();
  const idsToFetch = new Set<string>();

  for (const a of artists) {
    idsToFetch.add(a.artistId);
  }

  const albumArtistIdByAlbum = new Map<string, string>();
  const albumIdList = albums.map((a) => a.albumId).filter(isValidCatalogId);
  for (let i = 0; i < albumIdList.length; i += CHUNK) {
    const chunk = albumIdList.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("albums")
      .select("id, name, artist_id")
      .in("id", chunk);
    if (error) {
      console.warn("[top-this-week] albums name lookup", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; name: string | null; artist_id: string | null };
      const al = albums.find((x) => x.albumId === r.id);
      if (!al) continue;
      if (r.name?.trim()) {
        albumNameById.set(r.id, r.name.trim());
      }
      if (r.name?.trim() && needsNameFallback(al.name, al.albumId)) {
        al.name = r.name.trim();
      }
      if (r.artist_id?.trim()) {
        albumArtistIdByAlbum.set(r.id, r.artist_id.trim());
        idsToFetch.add(r.artist_id.trim());
      }
    }
  }

  const artistIdList = [...idsToFetch];
  for (let i = 0; i < artistIdList.length; i += CHUNK) {
    const chunk = artistIdList.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("artists")
      .select("id, name")
      .in("id", chunk);
    if (error) {
      console.warn("[top-this-week] artists name lookup", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; name: string | null };
      if (r.name?.trim()) artistNameById.set(r.id, r.name.trim());
    }
  }

  for (const a of artists) {
    if (needsNameFallback(a.name, a.artistId)) {
      const n = artistNameById.get(a.artistId);
      if (n) a.name = n;
    }
  }

  for (const al of albums) {
    if (needsNameFallback(al.name, al.albumId)) {
      const n = albumNameById.get(al.albumId);
      if (n) al.name = n;
    }
    const albumArtistId = albumArtistIdByAlbum.get(al.albumId);
    if (
      albumArtistId &&
      (al.artistName === "—" ||
        !al.artistName.trim() ||
        needsNameFallback(al.artistName, albumArtistId))
    ) {
      const an = artistNameById.get(albumArtistId);
      if (an) al.artistName = an;
    }
  }
}
