import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueSpotifyEnrich } from "@/lib/jobs/spotifyQueue";
import { fetchLastfmRecentTracksSafe } from "@/lib/lastfm/fetch-recent";
import type { LastfmNormalizedScrobble } from "@/lib/lastfm/types";
import { syncBatchLogSideEffects } from "@/lib/sync-manual-log-side-effects";
import { DEFAULT_SCROBBLE_DEDUP_MS } from "@/lib/lastfm/dedupe";

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

async function filterAgainstExistingLfmLogs(
  supabase: SupabaseClient,
  userId: string,
  entries: { songId: string; listenedAt: string }[],
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
  const trackIds = [
    ...new Set(
      lfmSongKeys.map((k) => lfmToCanon.get(k) ?? k),
    ),
  ];
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
    const canon = lfmToCanon.get(e.songId) ?? e.songId;
    const conflict = existing.some((row) => {
      if (row.track_id !== canon) return false;
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
      const keepImg = (existingAlb as { image_url?: string | null } | null)
        ?.image_url?.trim();
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
    const { error: achErr } = await supabase.rpc("grant_achievements_on_listen", {
      p_user_id: userId,
    });
    if (achErr) {
      console.warn("[lastfm ingest] grant_achievements_on_listen failed", achErr);
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
