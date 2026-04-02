import { NextRequest } from "next/server";
import { backfillCommunityWeeklyChartsForAllCommunities } from "@/lib/charts/backfill-community-weekly-charts";

/** Vercel / serverless: default ~10s is too low for large backfills; increase if your host allows. */
export const maxDuration = 300;
import {
  apiUnauthorized,
  apiOk,
  apiError,
  apiBadRequest,
} from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/**
 * **One-time / rare:** backfill `community_weekly_charts` for every completed chart week (Sun–Sat UTC)
 * from each community’s first member listen through the latest completed week.
 *
 * Requires migration `121_community_listen_time_bounds_rpc.sql` (`get_community_listen_time_bounds`).
 *
 * Auth: `Authorization: Bearer CRON_SECRET`. Optional: `?communityId=<uuid>` for a single community.
 * Optional: `?verbose=1` to include `perCommunity` in the JSON (can be large).
 *
 * Long runs: set `COMMUNITY_WEEKLY_BACKFILL_MAX_WEEKS` if you hit the week cap (see server logs).
 * On Vercel, `maxDuration` on this route is 300s — very large histories may need batching by `communityId`.
 *
 * Idempotent (upserts). Do not add to `vercel.json` crons unless you intend periodic full replays.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiUnauthorized();
    }
  }

  const { searchParams } = new URL(request.url);
  const communityId = searchParams.get("communityId")?.trim() ?? undefined;
  if (communityId && !isValidUuid(communityId)) {
    return apiBadRequest("communityId must be a valid UUID");
  }

  try {
    const verbose = searchParams.get("verbose") === "1";
    console.log("[cron] community-weekly-charts-backfill request", {
      communityId: communityId ?? null,
      verbose,
    });
    const result = await backfillCommunityWeeklyChartsForAllCommunities(
      communityId ? { communityId } : undefined,
    );
    const { perCommunity, ...summary } = result;
    return apiOk({
      ok: true,
      ...summary,
      ...(verbose ? { perCommunity } : { perCommunityOmitted: true }),
    });
  } catch (e) {
    console.error("[cron] community-weekly-charts-backfill", e);
    return apiError("Community weekly charts backfill failed", 500);
  }
}
