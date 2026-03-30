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
const CATALOG_ONLINE: CatalogFetchOpts = { allowNetwork: true };

function hasArtistArtwork(
  a: SpotifyApi.ArtistObjectFull | null | undefined,
): boolean {
  return Boolean(a?.images?.[0]?.url?.trim());
}

function hasAlbumArtwork(
  a: SpotifyApi.AlbumObjectSimplified | null | undefined,
): boolean {
  return Boolean(a?.images?.[0]?.url?.trim());
}

/** Track tile uses album cover — that is what we gate Spotify on. */
function hasTrackAlbumArtwork(
  t: SpotifyApi.TrackObjectFull | null | undefined,
): boolean {
  return Boolean(t?.album?.images?.[0]?.url?.trim());
}

function mergeArtistMeta(
  prev: SpotifyApi.ArtistObjectFull | null,
  next: SpotifyApi.ArtistObjectFull | null,
): SpotifyApi.ArtistObjectFull | null {
  if (hasArtistArtwork(next)) return next;
  if (hasArtistArtwork(prev)) return prev;
  return next ?? prev;
}

function mergeTrackMeta(
  prev: SpotifyApi.TrackObjectFull | null,
  next: SpotifyApi.TrackObjectFull | null,
): SpotifyApi.TrackObjectFull | null {
  if (hasTrackAlbumArtwork(next)) return next;
  if (hasTrackAlbumArtwork(prev)) return prev;
  return next ?? prev;
}

function mergeAlbumMeta(
  prev: SpotifyApi.AlbumObjectSimplified | null,
  next: SpotifyApi.AlbumObjectSimplified | null,
): SpotifyApi.AlbumObjectSimplified | null {
  if (hasAlbumArtwork(next)) return next;
  if (hasAlbumArtwork(prev)) return prev;
  return next ?? prev;
}

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
  /** Rolling window label, e.g. date span · UTC */
  rangeLabel: string;
  tracks: TopWeekTrack[];
  artists: TopWeekArtist[];
  albums: TopWeekAlbum[];
};

/** Reject null DB values and string placeholders that become `/artist/null` in URLs. */
function isValidCatalogId(id: unknown): id is string {
  if (id == null || typeof id !== "string") return false;
  const t = id.trim();
  if (t.length === 0) return false;
  if (t === "null" || t === "undefined") return false;
  return true;
}

async function fetchSongsBatch(
  admin: SupabaseClient,
  ids: string[],
): Promise<Map<string, { album_id: string; artist_id: string }>> {
  const out = new Map<string, { album_id: string; artist_id: string }>();
  const unique = [...new Set(ids)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("songs")
      .select("id, album_id, artist_id")
      .in("id", chunk);
    if (error) {
      console.error("[top-this-week] songs batch", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; album_id: string; artist_id: string };
      out.set(r.id, { album_id: r.album_id, artist_id: r.artist_id });
    }
  }
  return out;
}

/**
 * Top tracks, artists, and albums over the **rolling last 7 days** (UTC) from `logs`,
 * so charts stay full at the start of a calendar week.
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

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("track_id, artist_id")
    .eq("user_id", uid)
    .gte("listened_at", current.startIso)
    .lt("listened_at", current.endExclusiveIso)
    .limit(MAX_LOGS);

  if (logErr) {
    console.error("[top-this-week] logs:", logErr);
    return empty();
  }

  const rows = (logRows ?? []) as { track_id: string; artist_id: string | null }[];
  if (rows.length === 0) return empty();

  const trackIds = [...new Set(rows.map((r) => r.track_id).filter(Boolean))] as string[];
  const songMap = trackIds.length ? await fetchSongsBatch(admin, trackIds) : new Map();

  const trackCount = new Map<string, number>();
  const artistCount = new Map<string, number>();
  const albumCount = new Map<string, number>();

  for (const r of rows) {
    const tid = r.track_id?.trim();
    if (tid && isValidCatalogId(tid)) {
      trackCount.set(tid, (trackCount.get(tid) ?? 0) + 1);
    }
    const song = tid ? songMap.get(tid) : undefined;
    const aid = r.artist_id?.trim() ?? song?.artist_id?.trim() ?? null;
    if (aid && isValidCatalogId(aid)) {
      artistCount.set(aid, (artistCount.get(aid) ?? 0) + 1);
    }
    const albid = song?.album_id?.trim();
    if (albid && isValidCatalogId(albid)) {
      albumCount.set(albid, (albumCount.get(albid) ?? 0) + 1);
    }
  }

  const sortedTracks = [...trackCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);
  const sortedArtists = [...artistCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);
  const sortedAlbums = [...albumCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N);

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

  const artistNeedArtwork = artistIds.filter(
    (id) => !hasArtistArtwork(artistMetaById.get(id)),
  );
  const trackNeedArtwork = trackIdsTop.filter(
    (id) => !hasTrackAlbumArtwork(trackMetaById.get(id)),
  );
  const albumNeedArtwork = albumIds.filter(
    (id) => !hasAlbumArtwork(albumMetaById.get(id)),
  );

  if (
    artistNeedArtwork.length > 0 ||
    trackNeedArtwork.length > 0 ||
    albumNeedArtwork.length > 0
  ) {
    const pass2 = await fetchCatalogBatches(
      artistNeedArtwork,
      trackNeedArtwork,
      albumNeedArtwork,
      CATALOG_ONLINE,
    );
    for (let i = 0; i < artistNeedArtwork.length; i++) {
      const id = artistNeedArtwork[i]!;
      artistMetaById.set(
        id,
        mergeArtistMeta(artistMetaById.get(id) ?? null, pass2.artistMetaList[i] ?? null),
      );
    }
    for (let i = 0; i < trackNeedArtwork.length; i++) {
      const id = trackNeedArtwork[i]!;
      trackMetaById.set(
        id,
        mergeTrackMeta(trackMetaById.get(id) ?? null, pass2.trackMetaList[i] ?? null),
      );
    }
    for (let i = 0; i < albumNeedArtwork.length; i++) {
      const id = albumNeedArtwork[i]!;
      albumMetaById.set(
        id,
        mergeAlbumMeta(albumMetaById.get(id) ?? null, pass2.albumMetaList[i] ?? null),
      );
    }
  }

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
    const albumId = t?.album?.id?.trim();
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

/**
 * When Spotify/cache returns null, UI fell back to raw catalog ids — fill from
 * `artists` / `albums` rows (incl. Last.fm–backed ids).
 */
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
  const albumIds = albums.map((a) => a.albumId).filter(isValidCatalogId);
  for (let i = 0; i < albumIds.length; i += CHUNK) {
    const chunk = albumIds.slice(i, i + CHUNK);
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
