import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { syncBatchLogSideEffects } from "@/lib/sync-manual-log-side-effects";

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
): LastfmImportHighlight[] {
  const insertedSet = new Set(
    (inserted ?? []).map((r) => `${r.track_id}|${r.listened_at}`),
  );
  const out: LastfmImportHighlight[] = [];
  for (const e of afterFilter) {
    if (out.length >= 3) break;
    const k = entryKey(e);
    if (!insertedSet.has(k)) continue;
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

  const rows = afterFilter.map((e) => ({
    user_id: userId,
    track_id: e.spotifyTrackId,
    listened_at: e.listenedAt,
    source: "lastfm" as const,
    album_id: e.albumId ?? null,
    artist_id: e.artistId ?? null,
    note: null as string | null,
  }));

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
  const conflictSkipped = afterFilter.length - imported;
  const skipped = dupSkipped + existingSkipped + conflictSkipped;

  const highlights = buildHighlights(
    afterFilter,
    inserted as { track_id: string; listened_at: string }[] | null,
    metaByKey,
  );

  if (imported > 0) {
    const { error: achErr } = await supabase.rpc("grant_achievements_on_listen", {
      p_user_id: userId,
    });
    if (achErr) {
      console.warn("[lastfm import] grant_achievements_on_listen failed", achErr);
    }
    await syncBatchLogSideEffects(
      userId,
      afterFilter.map((e) => ({
        trackId: e.spotifyTrackId,
        listenedAtIso: e.listenedAt,
      })),
    );
  }

  return {
    imported,
    requested,
    skipped,
    highlights,
  };
}
