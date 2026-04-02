import { NextRequest } from "next/server";
import { backfillWeeklyChartsForAllUsers } from "@/lib/charts/backfill-weekly-charts";
import { apiUnauthorized, apiOk, apiError, apiBadRequest } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/**
 * **One-time / rare:** backfill `user_weekly_charts` for all completed chart weeks (Sun–Sat UTC) from each
 * user's first listen through the latest completed week (chronological per user).
 *
 * Same auth as other crons: `Authorization: Bearer CRON_SECRET`.
 * Optional: `?userId=<uuid>` to backfill a single user (smoke test).
 *
 * Idempotent (upserts). Safe to re-run. Do not add to `vercel.json` crons — run manually once.
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
  const userId = searchParams.get("userId")?.trim() ?? undefined;
  if (userId && !isValidUuid(userId)) {
    return apiBadRequest("userId must be a valid UUID");
  }

  try {
    const verbose = searchParams.get("verbose") === "1";
    const result = await backfillWeeklyChartsForAllUsers(
      userId ? { userId } : undefined,
    );
    const { perUser, ...summary } = result;
    return apiOk({
      ok: true,
      ...summary,
      ...(verbose ? { perUser } : { perUserOmitted: true }),
    });
  } catch (e) {
    console.error("[cron] weekly-charts-backfill", e);
    return apiError("Backfill failed", 500);
  }
}
