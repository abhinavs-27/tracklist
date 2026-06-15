import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import type { LastfmNormalizedScrobble } from "@/lib/lastfm/types";
import { syncBatchLogSideEffects } from "@/lib/sync-manual-log-side-effects";
import { DEFAULT_SCROBBLE_DEDUP_MS } from "@/lib/lastfm/dedupe";
import { isDebugLastfmSync } from "@/lib/lastfm/sync-debug";
import { isValidUuid } from "@/lib/validation";

import {
  findAlbumIdByArtistAndName,
  findArtistIdByNormalizedName,
  findTrackIdByArtistAlbumAndName,
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
  linkAlbumExternalId,
  linkArtistExternalId,
  linkTrackExternalId,
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
 *
 * - `logs.track_id` is UUID-only: never pass synthetic `lfm:*` into `.in("track_id", …)`.
 * - When no UUID mapping exists yet, still check `listens` (artist/track + time) and a wide `logs` scan
 *   joined via `track_external_ids` so we do not double-import after a partial run.
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
    (extRows ?? []).map((r) => [
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

  /**
   * When no Last.fm→UUID mapping exists yet, or the narrow query failed: scan logs in the time
   * window and keep rows whose `track_id` links to one of our `lfm:*` keys (via `track_external_ids`).
   */
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
          (windowLogs ?? []).map((w) => (w as { track_id: string }).track_id),
        ),
      ];
      const { data: te } = await supabase
        .from("track_external_ids")
        .select("track_id, external_id")
        .eq("source", "lastfm")
        .in("track_id", tids)
        .in("external_id", lfmSongKeys);

      const allowed = new Set(
        (te ?? []).map((r) => (r as { track_id: string }).track_id),
      );
      for (const r of te ?? []) {
        const row = r as { track_id: string; external_id: string };
        trackToLfm.set(row.track_id, row.external_id);
      }
      for (const w of windowLogs ?? []) {
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

/** Persistent cache shared across pages in a bulk import run. Pass the same object to every ingestLastfmScrobbles call. */
export type IngestEntityCache = {
  artists: Map<string, string>; // lastfm artist external_id → uuid
  albums: Map<string, string>;  // lastfm album external_id → uuid
  tracks: Map<string, string>;  // lastfm track external_id → uuid
};

export function createIngestEntityCache(): IngestEntityCache {
  return { artists: new Map(), albums: new Map(), tracks: new Map() };
}

export type IngestLastfmScrobblesOptions = {
  /**
   * When false, skip enqueueing `resolve_track_spotify` and `enrich_track` batch jobs
   * (Last.fm-only backfill; run enrichment-retry / repair later). Default true.
   */
  enqueueSpotifyResolve?: boolean;
  /** Skip calling refresh_entity_stats after each page — set true during bulk imports and call once at the end. */
  skipEntityStatsRefresh?: boolean;
  /** Skip UPDATE calls on already-existing artist/album rows and skip achievements RPC. Set true for bulk imports. */
  skipEntityUpdates?: boolean;
  /** Skip the pre-insert dedup filter. The upsert onConflict handles true duplicates. Set true for bulk imports where most scrobbles are new. */
  skipDedup?: boolean;
  /** Persistent cross-page cache. Pass the same object across all pages in a bulk import to avoid re-fetching the same entities. */
  entityCache?: IngestEntityCache;
};

/**
 * Primary Last.fm ingestion: `listens` + minimal `artists` / `songs` rows + `logs`,
 * then enqueue async Spotify enrichment (never blocks on Spotify), unless disabled.
 */
export async function ingestLastfmScrobbles(
  supabase: SupabaseClient,
  userId: string,
  scrobbles: LastfmNormalizedScrobble[],
  options?: IngestLastfmScrobblesOptions,
): Promise<IngestLastfmResult> {
  const { enqueueSpotifyResolve = true, skipEntityStatsRefresh = false, skipEntityUpdates = false, skipDedup = false, entityCache } = options ?? {};

  if (scrobbles.length === 0) {
    return { insertedLogs: 0, insertedListens: 0, skipped: 0 };
  }

  const candidates = scrobbles.map((s) => ({
    scrobble: s,
    songId: lfmSongId(s.artistName, s.trackName),
    artistId: lfmArtistId(s.artistName),
    listenedAt: s.listenedAtIso,
  }));

  const tFilter0 = Date.now();
  let pending = candidates;
  if (!skipDedup) {
    const toConsider = await filterAgainstExistingLfmLogs(
      supabase,
      userId,
      candidates.map((c) => ({ songId: c.songId, listenedAt: c.listenedAt })),
    );
    const allow = new Set(toConsider.map((t) => `${t.songId}|${t.listenedAt}`));
    pending = candidates.filter((c) => allow.has(`${c.songId}|${c.listenedAt}`));
  }
  const filterMs = Date.now() - tFilter0;

  if (pending.length === 0) {
    if (isDebugLastfmSync()) {
      console.log("[lastfm-sync] ingest dedupe only", {
        userId,
        filterMs,
        candidates: scrobbles.length,
      });
    }
    return {
      insertedLogs: 0,
      insertedListens: 0,
      skipped: scrobbles.length,
    };
  }

  const now = new Date().toISOString();
  let insertedListens = 0;
  /** One resolve job per distinct song per batch (avoids duplicate BullMQ work + spreads load). */
  const resolveQueuedForSong = new Set<string>();
  let resolveStaggerSlot = 0;
  const ingestedForLogs: { listenedAt: string; trackUuid: string }[] = [];

  // ── Bulk pre-load external IDs — skip IDs already in the cross-page cache ──
  const allArtistExtIds = [...new Set(pending.map((p) => p.artistId))];
  const allSongExtIds = [...new Set(pending.map((p) => p.songId))];
  const allAlbumExtIds = [
    ...new Set(
      pending
        .map((p) =>
          p.scrobble.albumName?.trim()
            ? lfmAlbumId(p.scrobble.artistName, p.scrobble.albumName.trim())
            : null,
        )
        .filter((k): k is string => k != null),
    ),
  ];

  const uncachedArtistIds = entityCache ? allArtistExtIds.filter((id) => !entityCache.artists.has(id)) : allArtistExtIds;
  const uncachedSongIds = entityCache ? allSongExtIds.filter((id) => !entityCache.tracks.has(id)) : allSongExtIds;
  const uncachedAlbumIds = entityCache ? allAlbumExtIds.filter((id) => !entityCache.albums.has(id)) : allAlbumExtIds;

  const [artistExtRows, trackExtRows, albumExtRows] = await Promise.all([
    uncachedArtistIds.length > 0
      ? supabase.from("artist_external_ids").select("external_id, artist_id").eq("source", "lastfm").in("external_id", uncachedArtistIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    uncachedSongIds.length > 0
      ? supabase.from("track_external_ids").select("external_id, track_id").eq("source", "lastfm").in("external_id", uncachedSongIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
    uncachedAlbumIds.length > 0
      ? supabase.from("album_external_ids").select("external_id, album_id").eq("source", "lastfm").in("external_id", uncachedAlbumIds).then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);

  // Seed local caches from cross-page cache first, then overlay fresh DB results
  const artistExtCache = new Map<string, string>(entityCache?.artists);
  for (const r of artistExtRows as { external_id: string; artist_id: string }[]) {
    artistExtCache.set(r.external_id, r.artist_id);
    entityCache?.artists.set(r.external_id, r.artist_id);
  }
  const trackExtCache = new Map<string, string>(entityCache?.tracks);
  for (const r of trackExtRows as { external_id: string; track_id: string }[]) {
    trackExtCache.set(r.external_id, r.track_id);
    entityCache?.tracks.set(r.external_id, r.track_id);
  }
  const albumExtCache = new Map<string, string>(entityCache?.albums);
  for (const r of albumExtRows as { external_id: string; album_id: string }[]) {
    albumExtCache.set(r.external_id, r.album_id);
    entityCache?.albums.set(r.external_id, r.album_id);
  }

  // ── Batch name lookups for uncached entities (3 queries, replaces N sequential calls) ──

  // 1. Artists not in external-id cache → look up by normalized name
  const uncachedArtistNorms = [...new Set(
    pending
      .filter((p) => !artistExtCache.has(p.artistId))
      .map((p) => normalizedName(p.scrobble.artistName))
      .filter((n): n is string => !!n),
  )];
  const artistNameMap = new Map<string, string>(); // name_normalized → uuid
  if (uncachedArtistNorms.length > 0) {
    const { data: anRows } = await supabase
      .from("artists")
      .select("id, name_normalized")
      .in("name_normalized", uncachedArtistNorms);
    for (const r of (anRows ?? []) as { id: string; name_normalized: string }[]) {
      artistNameMap.set(r.name_normalized, r.id);
    }
  }

  // 2. Albums not in external-id cache → look up by artist_id + normalized name
  const uncachedAlbumPending = pending.filter((p) => {
    const album = p.scrobble.albumName?.trim();
    return album && !albumExtCache.has(lfmAlbumId(p.scrobble.artistName, album));
  });
  const albumNameMap = new Map<string, string>(); // `${artistId}:${albumNorm}` → uuid
  if (uncachedAlbumPending.length > 0) {
    const albumArtistUuids = [...new Set(
      uncachedAlbumPending
        .map((p) => artistExtCache.get(p.artistId) ?? artistNameMap.get(normalizedName(p.scrobble.artistName)))
        .filter((u): u is string => !!u),
    )];
    const uncachedAlbumNorms = [...new Set(
      uncachedAlbumPending
        .map((p) => normalizedName(p.scrobble.albumName ?? ""))
        .filter((n): n is string => !!n),
    )];
    if (albumArtistUuids.length > 0 && uncachedAlbumNorms.length > 0) {
      const { data: albRows } = await supabase
        .from("albums")
        .select("id, name_normalized, artist_id")
        .in("artist_id", albumArtistUuids)
        .in("name_normalized", uncachedAlbumNorms);
      for (const r of (albRows ?? []) as { id: string; name_normalized: string; artist_id: string }[]) {
        albumNameMap.set(`${r.artist_id}:${r.name_normalized}`, r.id);
      }
    }
  }

  // 3. Tracks not in external-id cache → look up by artist_id + normalized name
  const uncachedTrackPending = pending.filter((p) => !trackExtCache.has(p.songId));
  const trackNameMap = new Map<string, string>(); // `${artistId}:${trackNorm}` → uuid
  if (uncachedTrackPending.length > 0) {
    const trackArtistUuids = [...new Set(
      uncachedTrackPending
        .map((p) => artistExtCache.get(p.artistId) ?? artistNameMap.get(normalizedName(p.scrobble.artistName)))
        .filter((u): u is string => !!u),
    )];
    const uncachedTrackNorms = [...new Set(
      uncachedTrackPending
        .map((p) => normalizedName(p.scrobble.trackName))
        .filter((n): n is string => !!n),
    )];
    if (trackArtistUuids.length > 0 && uncachedTrackNorms.length > 0) {
      const { data: trRows } = await supabase
        .from("tracks")
        .select("id, name_normalized, artist_id")
        .in("artist_id", trackArtistUuids)
        .in("name_normalized", uncachedTrackNorms);
      for (const r of (trRows ?? []) as { id: string; name_normalized: string; artist_id: string }[]) {
        trackNameMap.set(`${r.artist_id}:${r.name_normalized}`, r.id);
      }
    }
  }

  // Collect listens to batch-insert at the end
  const listensBatch: {
    user_id: string;
    artist_name: string;
    track_name: string;
    spotify_track_id: null;
    source: "lastfm";
    listened_at: string;
  }[] = [];

  // Collect new external ID links to batch-upsert at the end
  const newArtistLinks: { artist_id: string; source: "lastfm"; external_id: string }[] = [];
  const newTrackLinks: { track_id: string; source: "lastfm"; external_id: string }[] = [];
  const newAlbumLinks: { album_id: string; source: "lastfm"; external_id: string }[] = [];

  const tLoop0 = Date.now();
  for (const p of pending) {
    const { scrobble, songId, artistId, listenedAt } = p;
    const { artistName, trackName, albumName } = scrobble;

    const artistPreloaded = artistExtCache.has(artistId);
    let artistUuid =
      artistExtCache.get(artistId) ??
      artistNameMap.get(normalizedName(artistName));
    if (!artistUuid) {
      const { data: insArt } = await supabase
        .from("artists")
        .insert({
          name: artistName,
          lastfm_name: artistName,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          last_updated: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      if (!insArt) {
        // Concurrent page may have inserted this artist simultaneously — re-query
        const { data: existing } = await supabase
          .from("artists").select("id").eq("name_normalized", normalizedName(artistName)).maybeSingle();
        if (!existing) { console.warn("[lastfm ingest] artist insert + re-query both failed"); continue; }
        artistUuid = (existing as { id: string }).id;
      } else {
        artistUuid = insArt.id as string;
      }
    } else if (!skipEntityUpdates) {
      await supabase
        .from("artists")
        .update({
          name: artistName,
          lastfm_name: artistName,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          last_updated: now,
          updated_at: now,
        })
        .eq("id", artistUuid);
    }
    if (!artistPreloaded) newArtistLinks.push({ artist_id: artistUuid, source: "lastfm", external_id: artistId });
    artistExtCache.set(artistId, artistUuid);
    entityCache?.artists.set(artistId, artistUuid);

    const albumTitle = albumName?.trim() || null;
    let albumUuid: string | null = null;
    if (albumTitle) {
      const lfmAlbumKey = lfmAlbumId(artistName, albumTitle);
      const albumPreloaded = albumExtCache.has(lfmAlbumKey);
      albumUuid =
        albumExtCache.get(lfmAlbumKey) ??
        albumNameMap.get(`${artistUuid}:${normalizedName(albumTitle)}`) ??
        null;
      const coverFromScrobble =
        typeof scrobble.artworkUrl === "string" && scrobble.artworkUrl.trim()
          ? scrobble.artworkUrl.trim()
          : null;
      if (!albumUuid) {
        const { data: insAlb } = await supabase
          .from("albums")
          .insert({
            name: albumTitle,
            artist_id: artistUuid,
            image_url: coverFromScrobble ?? null,
            updated_at: now,
            cached_at: now,
          })
          .select("id")
          .maybeSingle();
        if (!insAlb) {
          // Concurrent insert conflict — re-query
          const { data: existingAlb } = await supabase
            .from("albums").select("id").eq("artist_id", artistUuid).eq("name_normalized", normalizedName(albumTitle)).maybeSingle();
          if (existingAlb) albumUuid = (existingAlb as { id: string }).id;
        } else {
          albumUuid = insAlb.id as string;
        }
      } else if (!skipEntityUpdates) {
        const { data: existingAlb } = await supabase
          .from("albums")
          .select("image_url")
          .eq("id", albumUuid)
          .maybeSingle();
        const keepImg = (existingAlb as { image_url?: string | null } | null)?.image_url?.trim();
        await supabase
          .from("albums")
          .update({
            name: albumTitle,
            artist_id: artistUuid,
            image_url: coverFromScrobble || keepImg || null,
            updated_at: now,
            cached_at: now,
          })
          .eq("id", albumUuid);
      }
      if (albumUuid) {
        if (!albumPreloaded) newAlbumLinks.push({ album_id: albumUuid, source: "lastfm", external_id: lfmAlbumKey });
        albumExtCache.set(lfmAlbumKey, albumUuid);
        entityCache?.albums.set(lfmAlbumKey, albumUuid);
      }
    }

    const trackPreloaded = trackExtCache.has(songId);
    let trackUuid =
      trackExtCache.get(songId) ??
      trackNameMap.get(`${artistUuid}:${normalizedName(trackName)}`);
    if (!trackUuid) {
      const { data: insTr } = await supabase
        .from("tracks")
        .insert({
          name: trackName,
          lastfm_name: trackName,
          lastfm_artist_name: artistName,
          album_id: albumUuid,
          artist_id: artistUuid,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      if (!insTr) {
        // Concurrent insert conflict — re-query
        const { data: existingTr } = await supabase
          .from("tracks").select("id").eq("artist_id", artistUuid).eq("name_normalized", normalizedName(trackName)).maybeSingle();
        if (!existingTr) { console.warn("[lastfm ingest] track insert + re-query both failed"); continue; }
        trackUuid = (existingTr as { id: string }).id;
      } else {
        trackUuid = insTr.id as string;
      }
    } else if (!skipEntityUpdates) {
      await supabase
        .from("tracks")
        .update({
          name: trackName,
          lastfm_name: trackName,
          lastfm_artist_name: artistName,
          album_id: albumUuid,
          artist_id: artistUuid,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          updated_at: now,
        })
        .eq("id", trackUuid);
    }
    if (!trackPreloaded) newTrackLinks.push({ track_id: trackUuid, source: "lastfm", external_id: songId });
    trackExtCache.set(songId, trackUuid);
    entityCache?.tracks.set(songId, trackUuid);
    listensBatch.push({
      user_id: userId,
      artist_name: artistName,
      track_name: trackName,
      spotify_track_id: null,
      source: "lastfm",
      listened_at: listenedAt,
    });
    ingestedForLogs.push({ listenedAt, trackUuid });

    /** Track job maps Last.fm → Spotify and links catalog to real Spotify ids (see resolveTrackSpotifyJob). */
    if (
      enqueueSpotifyResolve &&
      !resolveQueuedForSong.has(songId)
    ) {
      resolveQueuedForSong.add(songId);
      void enqueueSpotifyEnrich(
        {
          name: "resolve_track_spotify",
          lfmSongId: songId,
          artistName,
          trackName,
          albumName: albumName ?? null,
        },
        { staggerIndex: resolveStaggerSlot++ },
      );
    }
  }
  const perScrobbleLoopMs = Date.now() - tLoop0;

  // ── Flush batched inserts (listens + external ID links) ──────────────────────
  await Promise.all([
    // Batch-upsert all listens at once
    listensBatch.length > 0
      ? supabase
          .from("listens")
          .upsert(listensBatch, {
            onConflict: "user_id,artist_name,track_name,listened_at",
            ignoreDuplicates: true,
          })
          .then(({ error }) => {
            if (error && error.code !== "23505")
              console.warn("[lastfm ingest] listens batch upsert failed", error);
            else insertedListens += listensBatch.length;
          })
      : Promise.resolve(),
    // Batch-upsert all new external ID links
    newArtistLinks.length > 0
      ? supabase
          .from("artist_external_ids")
          .upsert(newArtistLinks, { onConflict: "source,external_id", ignoreDuplicates: true })
          .then(({ error }) => { if (error) console.warn("[lastfm ingest] artist links upsert", error); })
      : Promise.resolve(),
    newTrackLinks.length > 0
      ? supabase
          .from("track_external_ids")
          .upsert(newTrackLinks, { onConflict: "source,external_id", ignoreDuplicates: true })
          .then(({ error }) => { if (error) console.warn("[lastfm ingest] track links upsert", error); })
      : Promise.resolve(),
    newAlbumLinks.length > 0
      ? supabase
          .from("album_external_ids")
          .upsert(newAlbumLinks, { onConflict: "source,external_id", ignoreDuplicates: true })
          .then(({ error }) => { if (error) console.warn("[lastfm ingest] album links upsert", error); })
      : Promise.resolve(),
  ]);

  const logRows = ingestedForLogs.map((row) => ({
    user_id: userId,
    track_id: row.trackUuid,
    listened_at: row.listenedAt,
    source: "lastfm" as const,
    album_id: null as string | null,
    artist_id: null as string | null,
  }));

  const LOG_UPSERT_CHUNK = 10;
  const tLogs0 = Date.now();
  const inserted: { id: string; track_id: string; listened_at: string }[] = [];
  let logErr: { message: string } | null = null;

  for (let i = 0; i < logRows.length; i += LOG_UPSERT_CHUNK) {
    const chunk = logRows.slice(i, i + LOG_UPSERT_CHUNK);
    const { data, error } = await supabase
      .from("logs")
      .upsert(chunk, { onConflict: "user_id,track_id,listened_at", ignoreDuplicates: true })
      .select("id, track_id, listened_at");
    if (error) { logErr = error; break; }
    if (data) inserted.push(...data);
  }

  const logsUpsertMs = Date.now() - tLogs0;

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
    if (!skipEntityUpdates) {
      const tAch0 = Date.now();
      const { error: achErr } = await supabase.rpc(
        "grant_achievements_on_listen",
        { p_user_id: userId },
      );
      const achievementsRpcMs = Date.now() - tAch0;
      if (achErr) {
        console.warn("[lastfm ingest] grant_achievements_on_listen failed", achErr);
      }
    }
    const tBatchFx0 = Date.now();
    await syncBatchLogSideEffects(
      userId,
      ingestedForLogs.map((r) => ({
        trackId: r.trackUuid,
        listenedAtIso: r.listenedAt,
      })),
      { skipSpotifyEnrich: !enqueueSpotifyResolve, skipEntityStatsRefresh },
    );
    const batchSideEffectsMs = Date.now() - tBatchFx0;

    if (isDebugLastfmSync()) {
      console.log("[lastfm-sync] ingest breakdown", {
        userId,
        pending: pending.length,
        filterMs,
        perScrobbleLoopMs,
        msPerPending:
          pending.length > 0
            ? Math.round(perScrobbleLoopMs / pending.length)
            : 0,
        logsUpsertMs,
        batchSideEffectsMs,
      });
    } else if (batchSideEffectsMs >= 3000) {
      console.warn("[lastfm-sync] batch side-effects took long (often refresh_entity_stats)", {
        userId,
        batchSideEffectsMs,
      });
    }
  }

  return {
    insertedLogs,
    insertedListens,
    skipped: scrobbles.length - pending.length,
  };
}

/**
 * Fetch recent Last.fm tracks and ingest (admin client).
 */
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
