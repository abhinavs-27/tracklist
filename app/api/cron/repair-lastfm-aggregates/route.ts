import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { repairLastfmListeningAggregates } from "@/lib/analytics/repairLastfmAggregates";

/**
 * Backfills artist/album/genre listening aggregates for Last.fm logs that were counted
 * before async Spotify enrichment linked `songs` to catalog artists.
 *
 * Safe to run frequently; each log is repaired at most once.
 */
export const GET = withHandler(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const batch = Math.min(
    2000,
    Math.max(50, parseInt(searchParams.get("batch") ?? "500", 10) || 500),
  );

  const result = await repairLastfmListeningAggregates({ batchSize: batch });

  return apiOk({ ok: true, ...result });
});
