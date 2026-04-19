import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getOrCreateEntity } from "@/lib/catalog/getOrCreateEntity";
import {
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
} from "@/lib/catalog/entity-resolution";
import { syncBatchLogSideEffects } from "@/lib/sync-manual-log-side-effects";
import { isValidSpotifyId } from "@/lib/validation";

import { dedupeImportBatchByTimeWindow } from "./dedupe";
import { filterAgainstExistingLogs } from "./filter-existing-logs";
import type { LastfmImportEntry } from "./types";

export type LastfmImportHighlight = {
  spotifyTrackId: string;
  trackName: string;
  artistName: string;
  artworkUrl: string | null;
};

export type LastfmInsertResult = {
  imported: number;
  requested: number;
  skipped: number;
  highlights: LastfmImportHighlight[];
};

function entryKey(e: LastfmImportEntry): string {
  return `${e.spotifyTrackId}|${e.listenedAt}`;
}

function buildHighlights(
  afterFilter: LastfmImportEntry[],
  inserted: { track_id: string; listened_at: string }[] | null,
  metaByKey: Map<string, { trackName?: string; artistName?: string; artworkUrl?: string | null }>,
  trackUuidBySpotify: Map<string, string>,
): LastfmImportHighlight[] {
  const insertedSet = new Set(
    (inserted ?? []).map((r) => `${r.track_id}|${r.listened_at}`),
  );
  const out: LastfmImportHighlight[] = [];
  for (const e of afterFilter) {
    if (out.length >= 3) break;
    const k = entryKey(e);
    const tid = trackUuidBySpotify.get(e.spotifyTrackId);
    if (!tid || !insertedSet.has(`${tid}|${e.listenedAt}`)) continue;
    const meta = metaByKey.get(k) ?? {};
    out.push({
      spotifyTrackId: e.spotifyTrackId,
      trackName: meta.trackName ?? "Track",
      artistName: meta.artistName ?? "Artist",
      artworkUrl: meta.artworkUrl ?? null,
    });
  }
  return out;
}

/**
 * Dedupe → filter against existing logs → upsert. Runs achievements + side effects when any row inserts.
 */
export async function insertLastfmImportEntries(
  supabase: SupabaseClient,
  userId: string,
  entries: LastfmImportEntry[],
): Promise<LastfmInsertResult> {
  const requested = entries.length;
  if (requested === 0) {
    return { imported: 0, requested: 0, skipped: 0, highlights: [] };
  }

  const metaByKey = new Map<
    string,
    { trackName?: string; artistName?: string; artworkUrl?: string | null }
  >();
  for (const e of entries) {
    metaByKey.set(entryKey(e), {
      trackName: e.trackName,
      artistName: e.artistName,
      artworkUrl: e.artworkUrl,
    });
  }

  const afterDedupe = dedupeImportBatchByTimeWindow(entries);
  const dupSkipped = requested - afterDedupe.length;

  const afterFilter = await filterAgainstExistingLogs(supabase, userId, afterDedupe);
  const existingSkipped = afterDedupe.length - afterFilter.length;

  if (afterFilter.length === 0) {
    return {
      imported: 0,
      requested,
      skipped: dupSkipped + existingSkipped,
      highlights: [],
    };
  }

  const uniqueSpotifyTracks = [...new Set(afterFilter.map((e) => e.spotifyTrackId))];
  const trackUuidBySpotify = new Map<string, string>();
  for (const sid of uniqueSpotifyTracks) {
    let u = await getTrackIdByExternalId(supabase, "spotify", sid);
    if (!u) {
      try {
        const r = await getOrCreateEntity({
          type: "track",
          spotifyId: sid,
          allowNetwork: true,
        });
        u = r.id;
      } catch {
        u = null;
      }
    }
    if (u) trackUuidBySpotify.set(sid, u);
  }

  async function optionalSpotifyAlbumToUuid(
    spotifyAlbumId: string | null | undefined,
  ): Promise<string | null> {
    if (!spotifyAlbumId || !isValidSpotifyId(spotifyAlbumId)) return null;
    let u = await getAlbumIdByExternalId(supabase, "spotify", spotifyAlbumId);
    if (!u) {
      try {
        const r = await getOrCreateEntity({
          type: "album",
          spotifyId: spotifyAlbumId,
          allowNetwork: true,
        });
        u = r.id;
      } catch {
        u = null;
      }
    }
    return u;
  }

  async function optionalSpotifyArtistToUuid(
    spotifyArtistId: string | null | undefined,
  ): Promise<string | null> {
    if (!spotifyArtistId || !isValidSpotifyId(spotifyArtistId)) return null;
    let u = await getArtistIdByExternalId(supabase, "spotify", spotifyArtistId);
    if (!u) {
      try {
        const r = await getOrCreateEntity({
          type: "artist",
          spotifyId: spotifyArtistId,
          allowNetwork: true,
        });
        u = r.id;
      } catch {
        u = null;
      }
    }
    return u;
  }

  const rows: {
    user_id: string;
    track_id: string;
    listened_at: string;
    source: "lastfm";
    album_id: string | null;
    artist_id: string | null;
    note: null;
  }[] = [];

  for (const e of afterFilter) {
    const tid = trackUuidBySpotify.get(e.spotifyTrackId);
    if (!tid) continue;
    const album_id = await optionalSpotifyAlbumToUuid(e.albumId);
    const artist_id = await optionalSpotifyArtistToUuid(e.artistId);
    rows.push({
      user_id: userId,
      track_id: tid,
      listened_at: e.listenedAt,
      source: "lastfm",
      album_id,
      artist_id,
      note: null,
    });
  }

  if (rows.length === 0) {
    return {
      imported: 0,
      requested,
      skipped: dupSkipped + existingSkipped + afterFilter.length,
      highlights: [],
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("logs")
    .upsert(rows, {
      onConflict: "user_id,track_id,listened_at",
      ignoreDuplicates: true,
    })
    .select("id, track_id, listened_at");

  if (insertError) {
    throw insertError;
  }

  const imported = inserted?.length ?? 0;
  const droppedNoUuid = afterFilter.length - rows.length;
  const conflictSkipped = rows.length - imported;
  const skipped = dupSkipped + existingSkipped + droppedNoUuid + conflictSkipped;

  const highlights = buildHighlights(
    afterFilter,
    inserted as { track_id: string; listened_at: string }[] | null,
    metaByKey,
    trackUuidBySpotify,
  );

  if (imported > 0) {
    const { error: achErr } = await supabase.rpc("grant_achievements_on_listen", {
      p_user_id: userId,
    });
    if (achErr) {
      console.warn("[lastfm import] grant_achievements_on_listen failed", achErr);
    }
    const sideEffectEntries = (inserted ?? [])
      .map((r) => ({
        trackId: r.track_id,
        listenedAtIso: r.listened_at,
      }))
      .filter((x) => x.trackId);
    await syncBatchLogSideEffects(userId, sideEffectEntries);
  }

  return {
    imported,
    requested,
    skipped,
    highlights,
  };
}
