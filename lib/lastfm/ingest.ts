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
  findAlbumIdByArtistAndName,
  findArtistIdByNormalizedName,
  findTrackIdByArtistAlbumAndName,
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
  linkAlbumExternalId,
  linkArtistExternalId,
  linkTrackExternalId,
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

/**
 * Primary Last.fm ingestion: `listens` + minimal `artists` / `songs` rows + `logs`,
 * then enqueue async Spotify enrichment (never blocks on Spotify).
 */
export async function ingestLastfmScrobbles(
  supabase: SupabaseClient,
  userId: string,
  scrobbles: LastfmNormalizedScrobble[],
): Promise<IngestLastfmResult> {
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
  let insertedListens = 0;
  /** One resolve job per distinct song per batch (avoids duplicate BullMQ work + spreads load). */
  const resolveQueuedForSong = new Set<string>();
  let resolveStaggerSlot = 0;
  const ingestedForLogs: { listenedAt: string; trackUuid: string }[] = [];

  for (const p of pending) {
    const { scrobble, songId, artistId, listenedAt } = p;
    const { artistName, trackName, albumName } = scrobble;

    const { error: listenErr } = await supabase.from("listens").insert({
      user_id: userId,
      artist_name: artistName,
      track_name: trackName,
      spotify_track_id: null,
      source: "lastfm",
      listened_at: listenedAt,
    });
    if (!listenErr) insertedListens++;
    else if (listenErr.code !== "23505") {
      console.warn("[lastfm ingest] listens insert failed", listenErr);
    }

    let artistUuid =
      (await getArtistIdByExternalId(supabase, "lastfm", artistId)) ??
      (await findArtistIdByNormalizedName(supabase, artistName));
    if (!artistUuid) {
      const { data: insArt, error: insArtErr } = await supabase
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
        .single();
      if (insArtErr || !insArt) {
        console.warn("[lastfm ingest] artist insert failed", insArtErr);
        continue;
      }
      artistUuid = insArt.id as string;
    } else {
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
    await linkArtistExternalId(supabase, artistUuid, "lastfm", artistId);

    const albumTitle = albumName?.trim() || null;
    let albumUuid: string | null = null;
    if (albumTitle) {
      const lfmAlbumKey = lfmAlbumId(artistName, albumTitle);
      albumUuid =
        (await getAlbumIdByExternalId(supabase, "lastfm", lfmAlbumKey)) ??
        (await findAlbumIdByArtistAndName(supabase, artistUuid, albumTitle));
      const coverFromScrobble =
        typeof scrobble.artworkUrl === "string" && scrobble.artworkUrl.trim()
          ? scrobble.artworkUrl.trim()
          : null;
      const { data: existingAlb } = albumUuid
        ? await supabase
            .from("albums")
            .select("image_url")
            .eq("id", albumUuid)
            .maybeSingle()
        : { data: null };
      const keepImg = (
        existingAlb as { image_url?: string | null } | null
      )?.image_url?.trim();
      if (!albumUuid) {
        const { data: insAlb, error: insAlbErr } = await supabase
          .from("albums")
          .insert({
            name: albumTitle,
            artist_id: artistUuid,
            image_url: coverFromScrobble || keepImg || null,
            updated_at: now,
            cached_at: now,
          })
          .select("id")
          .single();
        if (insAlbErr || !insAlb) {
          console.warn("[lastfm ingest] album insert failed", insAlbErr);
        } else {
          albumUuid = insAlb.id as string;
        }
      } else {
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
        await linkAlbumExternalId(supabase, albumUuid, "lastfm", lfmAlbumKey);
      }
    }

    let trackUuid =
      (await getTrackIdByExternalId(supabase, "lastfm", songId)) ??
      (await findTrackIdByArtistAlbumAndName(
        supabase,
        artistUuid,
        albumUuid,
        trackName,
      ));
    if (!trackUuid) {
      const { data: insTr, error: insTrErr } = await supabase
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
        .single();
      if (insTrErr || !insTr) {
        console.warn("[lastfm ingest] track insert failed", insTrErr);
        continue;
      }
      trackUuid = insTr.id as string;
    } else {
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
    await linkTrackExternalId(supabase, trackUuid, "lastfm", songId);
    ingestedForLogs.push({ listenedAt, trackUuid });

    /** Track job maps Last.fm → Spotify and links catalog to real Spotify ids (see resolveTrackSpotifyJob). */
    if (!resolveQueuedForSong.has(songId)) {
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
    const { error: achErr } = await supabase.rpc(
      "grant_achievements_on_listen",
      {
        p_user_id: userId,
      },
    );
    if (achErr) {
      console.warn(
        "[lastfm ingest] grant_achievements_on_listen failed",
        achErr,
      );
    }
    await syncBatchLogSideEffects(
      userId,
      ingestedForLogs.map((r) => ({
        trackId: r.trackUuid,
        listenedAtIso: r.listenedAt,
      })),
    );
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
