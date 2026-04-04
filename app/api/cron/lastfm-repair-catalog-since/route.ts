import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/api-response";
import { DEFAULT_LASTFM_BACKFILL_SINCE_ISO } from "@/lib/lastfm/backfill-scrobbles-since";
import { repairLastfmCatalogForLogsSince } from "@/lib/lastfm/repair-catalog-for-logs-since";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * **Does not import Last.fm or insert logs** — only re-queues Spotify enrichment for
 * `tracks`/`artists` already tied to existing Last.fm `logs`. To pull missing scrobbles
 * from Last.fm, use `/api/cron/lastfm-backfill-since` or `/api/cron/lastfm-sync` instead.
 *
 * Query: `since`, `maxJobs`, `logScanLimit` (max log rows read, paginated; default 8000),
 * optional `userId` (only that user’s logs). Response includes `logRowsScanned` / `distinctTrackIds`.
 *
 * Tune Spotify pacing: `SPOTIFY_MIN_TIME_MS`, `SPOTIFY_RESERVOIR_PER_MIN`,
 * `SPOTIFY_RESOLVE_STAGGER_MS`, `SPOTIFY_SINGLE_TRACK_*` (see `packages/spotify-client`).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);

    const sinceIso =
      searchParams.get("since")?.trim() || DEFAULT_LASTFM_BACKFILL_SINCE_ISO;
    const maxJobs = Math.min(
      200,
      Math.max(1, parseInt(searchParams.get("maxJobs") ?? "40", 10) || 40),
    );
    const logScanLimit = Math.min(
      200_000,
      Math.max(
        500,
        parseInt(searchParams.get("logScanLimit") ?? "8000", 10) || 8000,
      ),
    );
    const userId = searchParams.get("userId")?.trim() || undefined;

    const result = await repairLastfmCatalogForLogsSince(supabase, sinceIso, {
      maxJobs,
      logScanLimit,
      userId,
    });

    console.log("[cron] lastfm-repair-catalog-since", {
      sinceIso,
      ...result,
    });

    return apiOk({
      ok: true,
      sinceIso,
      userId: userId ?? null,
      ...result,
    });
  } catch (e) {
    console.error("[cron lastfm-repair-catalog-since]", e);
    return apiError(e instanceof Error ? e.message : "repair failed", 500);
  }
}
