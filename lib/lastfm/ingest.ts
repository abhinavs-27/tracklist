import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import type { LastfmNormalizedScrobble } from "@/lib/lastfm/types";
import { syncBatchLogSideEffects } from "@/lib/sync-manual-log-side-effects";
import { DEFAULT_SCROBBLE_DEDUP_MS } from "@/lib/lastfm/dedupe";

import { lfmArtistId, lfmSongId } from "./lfm-ids";

export type IngestLastfmResult = {
  /** New rows inserted into `logs`. */
  insertedLogs: number;
  /** Rows written to `listens` (includes duplicates skipped at DB level). */
  insertedListens: number;
  skipped: number;
};

async function filterAgainstExistingLfmLogs(
  supabase: SupabaseClient,
  userId: string,
  entries: { songId: string; listenedAt: string }[],
  windowMs: number = DEFAULT_SCROBBLE_DEDUP_MS,
): Promise<typeof entries> {
  if (entries.length === 0) return [];

  const trackIds = [...new Set(entries.map((e) => e.songId))];
  const times = entries
    .map((e) => new Date(e.listenedAt).getTime())
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return [];

  const minT = Math.min(...times) - windowMs;
  const maxT = Math.max(...times) + windowMs;

  const { data, error } = await supabase
    .from("logs")
    .select("track_id, listened_at")
    .eq("user_id", userId)
    .in("track_id", trackIds)
    .gte("listened_at", new Date(minT).toISOString())
    .lte("listened_at", new Date(maxT).toISOString());

  if (error) {
    console.warn("[lastfm ingest] filter existing logs failed", error);
    return entries;
  }

  const existing = (data ?? []) as { track_id: string; listened_at: string }[];

  return entries.filter((e) => {
    const t = new Date(e.listenedAt).getTime();
    if (Number.isNaN(t)) return false;
    const conflict = existing.some((row) => {
      if (row.track_id !== e.songId) return false;
      const rt = new Date(row.listened_at).getTime();
      return Math.abs(rt - t) < windowMs;
    });
    return !conflict;
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

    const { error: artistErr } = await supabase.from("artists").upsert(
      {
        id: artistId,
        name: artistName,
        lastfm_name: artistName,
        data_source: "lastfm",
        needs_spotify_enrichment: true,
        last_updated: now,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (artistErr) {
      console.warn("[lastfm ingest] artist upsert failed", artistErr);
    }

    const { error: songErr } = await supabase.from("songs").upsert(
      {
        id: songId,
        name: trackName,
        lastfm_name: trackName,
        lastfm_artist_name: artistName,
        album_id: null,
        artist_id: null,
        data_source: "lastfm",
        needs_spotify_enrichment: true,
        updated_at: now,
      },
      { onConflict: "id" },
    );
    if (songErr) {
      console.warn("[lastfm ingest] song upsert failed", songErr);
    }

    void enqueueSpotifyEnrich({
      name: "resolve_artist_spotify",
      lfmArtistId: artistId,
      artistName,
    });
    void enqueueSpotifyEnrich({
      name: "resolve_track_spotify",
      lfmSongId: songId,
      artistName,
      trackName,
      albumName: albumName ?? null,
    });
  }

  const logRows = pending.map((p) => ({
    user_id: userId,
    track_id: p.songId,
    listened_at: p.listenedAt,
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
    const { error: achErr } = await supabase.rpc("grant_achievements_on_listen", {
      p_user_id: userId,
    });
    if (achErr) {
      console.warn("[lastfm ingest] grant_achievements_on_listen failed", achErr);
    }
    await syncBatchLogSideEffects(
      userId,
      pending.map((p) => ({
        trackId: p.songId,
        listenedAtIso: p.listenedAt,
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
  const result = await fetchLastfmRecentTracksSafe(lastfmUsername.trim(), limit);
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
