import { NextRequest } from "next/server";
import { apiUnauthorized, apiOk, apiError, apiBadRequest } from "@/lib/api-response";
import { runRepairArtistAggregates } from "@/lib/cron/cron-runners";
import {
  repairMissingArtistAggregates,
  repairOrphanedArtistAggregates,
} from "@/lib/analytics/repair-artist-aggregates";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { isValidUuid } from "@/lib/validation";

/**
 * Runs both artist aggregate repairs then refreshes the user's taste identity cache.
 *
 * Two separate bugs are fixed:
 *  1. Missing rows: logs processed before Spotify enrichment set tracks.artist_id
 *     (album plays counted, artist plays silently dropped).
 *  2. Orphaned rows: artist merges that hit a unique-constraint conflict left rows
 *     under the deleted loser UUID, showing as "Unknown" in top artists.
 *
 * ?userId=<uuid>  — targets one user, no row-limit issue, refreshes their cache immediately.
 * No ?userId      — global pass across all users.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiUnauthorized();
    }
  }

  const userId = request.nextUrl.searchParams.get("userId");

  if (userId) {
    if (!isValidUuid(userId)) return apiBadRequest("invalid userId");
    try {
      const [missing, orphaned] = await Promise.all([
        repairMissingArtistAggregates({ userId }),
        repairOrphanedArtistAggregates({ userId }),
      ]);
      await refreshTasteIdentityCacheForUser(userId);
      return apiOk({
        ok: true,
        userId,
        missingInserted: missing.inserted,
        orphanedMerged: orphaned.merged,
        errors: missing.errors + orphaned.errors,
      });
    } catch (e) {
      console.error("[cron] repair-artist-aggregates per-user", e);
      return apiError("Repair failed", 500);
    }
  }

  try {
    const result = await runRepairArtistAggregates();
    return apiOk(result);
  } catch (e) {
    console.error("[cron] repair-artist-aggregates", e);
    return apiError("Repair failed", 500);
  }
}
