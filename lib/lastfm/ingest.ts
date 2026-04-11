import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import type { LastfmNormalizedScrobble } from "@/lib/lastfm/types";
import { syncBatchLogSideEffects } from "@/lib/sync-manual-log-side-effects";
import { DEFAULT_SCROBBLE_DEDUP_MS } from "@/lib/lastfm/dedupe";
import { isValidUuid } from "@/lib/validation";

import {
  normalizedName,
} from "@/lib/catalog/entity-resolution";

import { lfmAlbumId, lfmArtistId, lfmSongId } from "./lfm-ids";

export type IngestLastfmResult = {
  /** New rows inserted into `logs`. */
  insertedLogs: number;
  /** Rows written to `listens` (includes duplicates skipped at DB level). */
  insertedListens: number;
  skipped: number;
};

/** One scrobble row for dedupe (logs + listens). */
type LfmDedupeEntry = {
  songId: string;
  listenedAt: string;
};

/**
 * Drop scrobbles that already have a matching `logs` or `listens` row (same user, same song, same time window).
 */
async function filterAgainstExistingLfmLogs(
  supabase: SupabaseClient,
  userId: string,
  entries: LfmDedupeEntry[],
  windowMs: number = DEFAULT_SCROBBLE_DEDUP_MS,
): Promise<typeof entries> {
  if (entries.length === 0) return [];

  const lfmSongKeys = [...new Set(entries.map((e) => e.songId))];
  const { data: extRows } = await supabase
    .from("track_external_ids")
    .select("external_id, track_id")
    .eq("source", "lastfm")
    .in("external_id", lfmSongKeys);
  const lfmToCanon = new Map(
    ((extRows ?? []) as any[]).map((r) => [
      (r as { external_id: string }).external_id,
      (r as { track_id: string }).track_id,
    ]),
  );
  /** Canonical track UUID → Last.fm external id (for log rows). */
  const trackToLfm = new Map<string, string>();
  for (const [ext, tid] of lfmToCanon) {
    if (isValidUuid(tid)) trackToLfm.set(tid, ext);
  }

  const times = entries
    .map((e) => new Date(e.listenedAt).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];

  const minT = Math.min(...times) - windowMs;
  const maxT = Math.max(...times) + windowMs;
  const minIso = new Date(minT).toISOString();
  const maxIso = new Date(maxT).toISOString();

  const uuidSet = [...new Set([...lfmToCanon.values()].filter(isValidUuid))];

  const logHits: { track_id: string; listened_at: string }[] = [];

  let logsByUuidFailed = false;
  if (uuidSet.length > 0) {
    const { data, error } = await supabase
      .from("logs")
      .select("track_id, listened_at")
      .eq("user_id", userId)
      .in("track_id", uuidSet)
      .gte("listened_at", minIso)
      .lte("listened_at", maxIso);

    if (error) {
      logsByUuidFailed = true;
      console.warn("[lastfm ingest] filter existing logs (by uuid) failed", error);
    } else {
      logHits.push(...((data ?? []) as { track_id: string; listened_at: string }[]));
    }
  }

  if (lfmSongKeys.length > 0 && (uuidSet.length === 0 || logsByUuidFailed)) {
    const { data: windowLogs, error: winErr } = await supabase
      .from("logs")
      .select("track_id, listened_at")
      .eq("user_id", userId)
      .gte("listened_at", minIso)
      .lte("listened_at", maxIso);

    if (winErr) {
      console.warn("[lastfm ingest] filter existing logs (window scan) failed", winErr);
    } else if ((windowLogs ?? []).length > 0) {
      const tids = [
        ...new Set(
          ((windowLogs ?? []) as any[]).map((w) => (w as { track_id: string }).track_id),
        ),
      ];
      const { data: te } = await supabase
        .from("track_external_ids")
        .select("track_id, external_id")
        .eq("source", "lastfm")
        .in("track_id", tids)
        .in("external_id", lfmSongKeys);

      const allowed = new Set(
        ((te ?? []) as any[]).map((r) => (r as { track_id: string }).track_id),
      );
      for (const r of (te ?? []) as any[]) {
        const row = r as { track_id: string; external_id: string };
        trackToLfm.set(row.track_id, row.external_id);
      }
      for (const w of (windowLogs ?? []) as any[]) {
        const row = w as { track_id: string; listened_at: string };
        if (allowed.has(row.track_id)) logHits.push(row);
      }
    }
  }

  const seen = new Set<string>();
  const existingLogs: { track_id: string; listened_at: string }[] = [];
  for (const h of logHits) {
    const k = `${h.track_id}\0${h.listened_at}`;
    if (seen.has(k)) continue;
    seen.add(k);
    existingLogs.push(h);
  }

  const { data: listenRows, error: listenErr } = await supabase
    .from("listens")
    .select("artist_name, track_name, listened_at")
    .eq("user_id", userId)
    .eq("source", "lastfm")
    .gte("listened_at", minIso)
    .lte("listened_at", maxIso);

  if (listenErr) {
    console.warn("[lastfm ingest] filter existing listens failed", listenErr);
  }

  const listens = (listenRows ?? []) as {
    artist_name: string;
    track_name: string;
    listened_at: string;
  }[];

  return entries.filter((e) => {
    const t = new Date(e.listenedAt).getTime();
    if (Number.isNaN(t)) return false;

    const logConflict = existingLogs.some((row) => {
      const rt = new Date(row.listened_at).getTime();
      if (Math.abs(rt - t) >= windowMs) return false;
      const ext = trackToLfm.get(row.track_id);
      return ext === e.songId;
    });
    if (logConflict) return false;

    const listenConflict = listens.some((lr) => {
      if (lfmSongId(lr.artist_name, lr.track_name) !== e.songId) return false;
      const rt = new Date(lr.listened_at).getTime();
      return Math.abs(rt - t) < windowMs;
    });
    return !listenConflict;
  });
}

export type IngestLastfmScrobblesOptions = {
  enqueueSpotifyResolve?: boolean;
};

export async function ingestLastfmScrobbles(
  supabase: SupabaseClient,
  userId: string,
  scrobbles: LastfmNormalizedScrobble[],
  options?: IngestLastfmScrobblesOptions,
): Promise<IngestLastfmResult> {
  const { enqueueSpotifyResolve = true } = options ?? {};

  if (scrobbles.length === 0) {
    return { insertedLogs: 0, insertedListens: 0, skipped: 0 };
  }

  const candidates = scrobbles.map((s) => ({
    scrobble: s,
    songId: lfmSongId(s.artistName, s.trackName),
    artistId: lfmArtistId(s.artistName),
    listenedAt: s.listenedAtIso,
  }));

  const toConsider = await filterAgainstExistingLfmLogs(
    supabase,
    userId,
    candidates.map((c) => ({ songId: c.songId, listenedAt: c.listenedAt })),
  );
  const allow = new Set(toConsider.map((t) => `${t.songId}|${t.listenedAt}`));
  const pending = candidates.filter((c) =>
    allow.has(`${c.songId}|${c.listenedAt}`),
  );

  if (pending.length === 0) {
    return {
      insertedLogs: 0,
      insertedListens: 0,
      skipped: scrobbles.length,
    };
  }

  const now = new Date().toISOString();

  // Batch insert listens
  const listensToInsert = pending.map((p) => ({
    user_id: userId,
    artist_name: p.scrobble.artistName,
    track_name: p.scrobble.trackName,
    spotify_track_id: null,
    source: "lastfm",
    listened_at: p.listenedAt,
  }));

  const { data: insertedListensRows, error: listensErr } = await supabase
    .from("listens")
    .upsert(listensToInsert, {
      onConflict: "user_id,artist_name,track_name,listened_at",
      ignoreDuplicates: true,
    })
    .select("id");

  const insertedListens = insertedListensRows?.length ?? 0;
  if (listensErr) {
    console.warn("[lastfm ingest] listens batch upsert failed", listensErr);
  }

  // Batch process artists
  const uniqueArtists = new Map<string, string>();
  for (const p of pending) {
    uniqueArtists.set(p.artistId, p.scrobble.artistName);
  }

  const artistIds = [...uniqueArtists.keys()];
  const artistNames = [...new Set(uniqueArtists.values())];

  const [artistExtRes, artistNameRes] = await Promise.all([
    supabase.from("artist_external_ids").select("external_id, artist_id").eq("source", "lastfm").in("external_id", artistIds),
    supabase.from("artists").select("id, name_normalized").in("name_normalized", artistNames.map(normalizedName))
  ]);

  const artistUuidByExtId = new Map<string, string>();
  for (const row of (artistExtRes.data ?? []) as { external_id: string; artist_id: string }[]) {
    artistUuidByExtId.set(row.external_id, row.artist_id);
  }

  const artistUuidByNormalizedName = new Map<string, string>();
  for (const row of (artistNameRes.data ?? []) as { id: string; name_normalized: string }[]) {
    artistUuidByNormalizedName.set(row.name_normalized, row.id);
  }

  const artistsToUpsert = [];
  for (const [artId, artName] of uniqueArtists) {
    const uuid = artistUuidByExtId.get(artId) ?? artistUuidByNormalizedName.get(normalizedName(artName));
    artistsToUpsert.push({
      ...(uuid ? { id: uuid } : {}),
      name: artName,
      lastfm_name: artName,
      data_source: "lastfm",
      needs_spotify_enrichment: true,
      last_updated: now,
      updated_at: now,
    });
  }

  const { data: upsertedArtists, error: artistErr } = await supabase
    .from("artists")
    .upsert(artistsToUpsert, { onConflict: "id" })
    .select("id, lastfm_name");

  if (artistErr) {
    console.error("[lastfm ingest] artists batch upsert failed", artistErr);
    return { insertedLogs: 0, insertedListens, skipped: scrobbles.length };
  }

  const artistUuidByLfmName = new Map<string, string>();
  for (const a of (upsertedArtists ?? []) as { id: string; lastfm_name: string }[]) {
    artistUuidByLfmName.set(a.lastfm_name, a.id);
  }

  // Link Artist External IDs
  const artistLinks = [];
  for (const [artId, artName] of uniqueArtists) {
    const uuid = artistUuidByLfmName.get(artName);
    if (uuid) artistLinks.push({ artist_id: uuid, source: "lastfm", external_id: artId });
  }
  if (artistLinks.length > 0) {
    await supabase.from("artist_external_ids").upsert(artistLinks, { onConflict: "source,external_id", ignoreDuplicates: true });
  }

  // Batch process albums
  const uniqueAlbums = new Map<string, { artistName: string; albumTitle: string; artworkUrl: string | null }>();
  for (const p of pending) {
    const albumTitle = p.scrobble.albumName?.trim() || null;
    if (albumTitle) {
      const key = lfmAlbumId(p.scrobble.artistName, albumTitle);
      if (!uniqueAlbums.has(key)) {
        uniqueAlbums.set(key, { artistName: p.scrobble.artistName, albumTitle, artworkUrl: p.scrobble.artworkUrl ?? null });
      }
    }
  }

  const lfmAlbumKeys = [...uniqueAlbums.keys()];
  const albumUuidByExtId = new Map<string, string>();
  if (lfmAlbumKeys.length > 0) {
    const { data: albExtRes } = await supabase.from("album_external_ids").select("external_id, album_id").eq("source", "lastfm").in("external_id", lfmAlbumKeys);
    for (const row of (albExtRes ?? []) as { external_id: string; album_id: string }[]) {
      albumUuidByExtId.set(row.external_id, row.album_id);
    }
  }

  const albumsToResolveByName = [];
  for (const [key, val] of uniqueAlbums) {
    if (!albumUuidByExtId.has(key)) {
      const artistUuid = artistUuidByLfmName.get(val.artistName);
      if (artistUuid) albumsToResolveByName.push({ artistUuid, albumTitle: val.albumTitle, key });
    }
  }

  const albumUuidByNameAndArtist = new Map<string, string>();
  if (albumsToResolveByName.length > 0) {
    const artistIdsForAlbums = [...new Set(albumsToResolveByName.map(a => a.artistUuid))];
    const { data: existingAlbums } = await supabase.from("albums").select("id, artist_id, name_normalized").in("artist_id", artistIdsForAlbums);
    const lookup = new Map<string, string>();
    for (const a of (existingAlbums ?? []) as { id: string; artist_id: string; name_normalized: string }[]) {
      lookup.set(`${a.artist_id}|${a.name_normalized}`, a.id);
    }
    for (const a of albumsToResolveByName) {
      const uuid = lookup.get(`${a.artistUuid}|${normalizedName(a.albumTitle)}`);
      if (uuid) albumUuidByNameAndArtist.set(a.key, uuid);
    }
  }

  const allResolvedAlbumUuids = [...new Set([...albumUuidByExtId.values(), ...albumUuidByNameAndArtist.values()])];
  const albumImageByUuid = new Map<string, string | null>();
  if (allResolvedAlbumUuids.length > 0) {
    const { data: albDetails } = await supabase.from("albums").select("id, image_url").in("id", allResolvedAlbumUuids);
    for (const d of (albDetails ?? []) as { id: string; image_url: string | null }[]) {
      albumImageByUuid.set(d.id, d.image_url);
    }
  }

  const albumsToUpsert = [];
  for (const [key, val] of uniqueAlbums) {
    const uuid = albumUuidByExtId.get(key) ?? albumUuidByNameAndArtist.get(key);
    const artistUuid = artistUuidByLfmName.get(val.artistName);
    if (!artistUuid) continue;

    const existingImg = uuid ? albumImageByUuid.get(uuid) : null;

    albumsToUpsert.push({
      ...(uuid ? { id: uuid } : {}),
      name: val.albumTitle,
      artist_id: artistUuid,
      image_url: val.artworkUrl || existingImg || null,
      updated_at: now,
      cached_at: now,
    });
  }

  const albumUuidByLfmKey = new Map<string, string>();
  if (albumsToUpsert.length > 0) {
    const { data: upsertedAlbums, error: albumErr } = await supabase
      .from("albums")
      .upsert(albumsToUpsert, { onConflict: "id" })
      .select("id, name, artist_id");
    if (albumErr) {
      console.error("[lastfm ingest] albums batch upsert failed", albumErr);
    } else {
      for (const a of (upsertedAlbums ?? []) as { id: string; name: string; artist_id: string }[]) {
        for (const [key, val] of uniqueAlbums) {
          if (normalizedName(val.albumTitle) === normalizedName(a.name) && artistUuidByLfmName.get(val.artistName) === a.artist_id) {
            albumUuidByLfmKey.set(key, a.id);
          }
        }
      }
    }
  }

  const albumLinks = [];
  for (const [key, uuid] of albumUuidByLfmKey) {
    albumLinks.push({ album_id: uuid, source: "lastfm", external_id: key });
  }
  if (albumLinks.length > 0) {
    await supabase.from("album_external_ids").upsert(albumLinks, { onConflict: "source,external_id", ignoreDuplicates: true });
  }

  // Batch process tracks
  const uniqueTracks = new Map<string, { artistName: string; trackName: string; albumName: string | null }>();
  for (const p of pending) {
    if (!uniqueTracks.has(p.songId)) {
      uniqueTracks.set(p.songId, { artistName: p.scrobble.artistName, trackName: p.scrobble.trackName, albumName: p.scrobble.albumName ?? null });
    }
  }

  const trackIds = [...uniqueTracks.keys()];
  const trackUuidByExtId = new Map<string, string>();
  if (trackIds.length > 0) {
    const { data: trackExtRes } = await supabase.from("track_external_ids").select("external_id, track_id").eq("source", "lastfm").in("external_id", trackIds);
    for (const row of (trackExtRes ?? []) as { external_id: string; track_id: string }[]) {
      trackUuidByExtId.set(row.external_id, row.track_id);
    }
  }

  const tracksToResolveByName = [];
  for (const [songId, val] of uniqueTracks) {
    if (!trackUuidByExtId.has(songId)) {
      const artistUuid = artistUuidByLfmName.get(val.artistName);
      const albumUuid = val.albumName ? albumUuidByLfmKey.get(lfmAlbumId(val.artistName, val.albumName)) : null;
      if (artistUuid) tracksToResolveByName.push({ artistUuid, albumUuid, trackName: val.trackName, songId });
    }
  }

  const trackUuidByNameArtistAlbum = new Map<string, string>();
  if (tracksToResolveByName.length > 0) {
    const artistIdsForTracks = [...new Set(tracksToResolveByName.map(t => t.artistUuid))];
    const { data: existingTracks } = await supabase.from("tracks").select("id, artist_id, album_id, name_normalized").in("artist_id", artistIdsForTracks);
    const lookup = new Map<string, string>();
    for (const t of (existingTracks ?? []) as { id: string; artist_id: string; album_id: string | null; name_normalized: string }[]) {
      lookup.set(`${t.artist_id}|${t.album_id ?? "null"}|${t.name_normalized}`, t.id);
    }
    for (const t of tracksToResolveByName) {
      const uuid = lookup.get(`${t.artistUuid}|${t.albumUuid ?? "null"}|${normalizedName(t.trackName)}`);
      if (uuid) trackUuidByNameArtistAlbum.set(t.songId, uuid);
    }
  }

  const tracksToUpsert = [];
  for (const [songId, val] of uniqueTracks) {
    const uuid = trackUuidByExtId.get(songId) ?? trackUuidByNameArtistAlbum.get(songId);
    const artistUuid = artistUuidByLfmName.get(val.artistName);
    const albumUuid = val.albumName ? albumUuidByLfmKey.get(lfmAlbumId(val.artistName, val.albumName)) : null;
    if (!artistUuid) continue;

    tracksToUpsert.push({
      ...(uuid ? { id: uuid } : {}),
      name: val.trackName,
      lastfm_name: val.trackName,
      lastfm_artist_name: val.artistName,
      album_id: albumUuid,
      artist_id: artistUuid,
      data_source: "lastfm",
      needs_spotify_enrichment: true,
      updated_at: now,
    });
  }

  const trackUuidByLfmSongId = new Map<string, string>();
  if (tracksToUpsert.length > 0) {
    const { data: upsertedTracks, error: trackErr } = await supabase
      .from("tracks")
      .upsert(tracksToUpsert, { onConflict: "id" })
      .select("id, name, artist_id, album_id");
    if (trackErr) {
      console.error("[lastfm ingest] tracks batch upsert failed", trackErr);
    } else {
      for (const t of (upsertedTracks ?? []) as { id: string; name: string; artist_id: string; album_id: string | null }[]) {
        for (const [songId, val] of uniqueTracks) {
          const albumUuid = val.albumName ? albumUuidByLfmKey.get(lfmAlbumId(val.artistName, val.albumName)) : null;
          if (val.trackName === t.name && artistUuidByLfmName.get(val.artistName) === t.artist_id && albumUuid === t.album_id) {
            trackUuidByLfmSongId.set(songId, t.id);
          }
        }
      }
    }
  }

  const trackLinks = [];
  for (const [songId, uuid] of trackUuidByLfmSongId) {
    trackLinks.push({ track_id: uuid, source: "lastfm", external_id: songId });
  }
  if (trackLinks.length > 0) {
    await supabase.from("track_external_ids").upsert(trackLinks, { onConflict: "source,external_id", ignoreDuplicates: true });
  }

  const ingestedForLogs: { listenedAt: string; trackUuid: string }[] = [];
  const resolveQueuedForSong = new Set<string>();
  let resolveStaggerSlot = 0;

  for (const p of pending) {
    const trackUuid = trackUuidByLfmSongId.get(p.songId);
    if (!trackUuid) continue;

    ingestedForLogs.push({ listenedAt: p.listenedAt, trackUuid });

    if (enqueueSpotifyResolve && !resolveQueuedForSong.has(p.songId)) {
      resolveQueuedForSong.add(p.songId);
      void enqueueSpotifyEnrich(
        {
          name: "resolve_track_spotify",
          lfmSongId: p.songId,
          artistName: p.scrobble.artistName,
          trackName: p.scrobble.trackName,
          albumName: p.scrobble.albumName ?? null,
        },
        { staggerIndex: resolveStaggerSlot++ },
      );
    }
  }

  const logRows = ingestedForLogs.map((row) => ({
    user_id: userId,
    track_id: row.trackUuid,
    listened_at: row.listenedAt,
    source: "lastfm" as const,
    album_id: null as string | null,
    artist_id: null as string | null,
  }));

  const { data: inserted, error: logErr } = await supabase
    .from("logs")
    .upsert(logRows, {
      onConflict: "user_id,track_id,listened_at",
      ignoreDuplicates: true,
    })
    .select("id, track_id, listened_at");

  if (logErr) {
    console.error("[lastfm ingest] logs upsert failed", logErr);
    return {
      insertedLogs: 0,
      insertedListens,
      skipped: scrobbles.length,
    };
  }

  const insertedLogs = inserted?.length ?? 0;

  if (insertedLogs > 0) {
    await supabase.rpc("grant_achievements_on_listen", { p_user_id: userId });
    await syncBatchLogSideEffects(
      userId,
      ingestedForLogs.map((r) => ({
        trackId: r.trackUuid,
        listenedAtIso: r.listenedAt,
      })),
      { skipSpotifyEnrich: !enqueueSpotifyResolve },
    );
  }

  return {
    insertedLogs,
    insertedListens,
    skipped: scrobbles.length - pending.length,
  };
}

export async function ingestRecentTracks(
  userId: string,
  lastfmUsername: string,
  limit = 100,
): Promise<IngestLastfmResult & { fetchError?: string }> {
  const result = await fetchLastfmRecentTracksSafe(
    lastfmUsername.trim(),
    limit,
  );
  if (!result.ok) {
    return {
      insertedLogs: 0,
      insertedListens: 0,
      skipped: 0,
      fetchError: result.error,
    };
  }
  const supabase = createSupabaseAdminClient();
  const ingest = await ingestLastfmScrobbles(supabase, userId, result.tracks);
  return ingest;
}
