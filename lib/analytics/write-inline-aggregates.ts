import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  accumulateListeningAggregateDeltas,
  applyListeningAggregateDeltaMaps,
  type AggregateLogRow,
  type AggregateCatalogContext,
} from "@/lib/analytics/listening-aggregate-deltas";

export async function writeInlineAggregates(
  logs: Array<{ id: string; user_id: string; track_id: string; listened_at: string }>,
  trackCatalog: Map<string, { artistId: string | null; albumId: string | null }>,
): Promise<void> {
  if (logs.length === 0) return;
  try {
    const admin = createSupabaseAdminClient();

    const ctx: AggregateCatalogContext = {
      songByTrack: new Map(
        [...trackCatalog.entries()].map(([id, { artistId, albumId }]) => [
          id,
          { artist_id: artistId, album_id: albumId },
        ]),
      ),
      albumById: new Map(),
      artistById: new Map(),
    };

    const rows: AggregateLogRow[] = logs.map((l) => ({
      id: l.id,
      user_id: l.user_id,
      track_id: l.track_id,
      listened_at: l.listened_at,
      created_at: l.listened_at,
      album_id: trackCatalog.get(l.track_id)?.albumId ?? null,
      artist_id: trackCatalog.get(l.track_id)?.artistId ?? null,
    }));

    const maps = accumulateListeningAggregateDeltas(rows, ctx, {
      includeTrackBumps: true,
    });
    await applyListeningAggregateDeltaMaps(admin, maps, () => {});

    // Mark AFTER aggregate write — if aggregate fails, drain can recover
    const { error } = await admin
      .from("user_listening_aggregate_ingest")
      .upsert(
        logs.map((l) => ({ log_id: l.id })),
        { onConflict: "log_id", ignoreDuplicates: true },
      );
    if (error) {
      console.warn("[writeInlineAggregates] ingest mark failed", error.message);
    }
  } catch (e) {
    console.warn("[writeInlineAggregates] failed", e);
  }
}
