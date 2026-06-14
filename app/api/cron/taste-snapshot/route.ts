import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiBadRequest } from "@/lib/api-response";
import { snapshotUserMonth, snapshotAllUsersLastMonth, monthStart } from "@/lib/cron/snapshot-taste";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidUuid } from "@/lib/validation";

/**
 * Taste snapshot — computes taste_snapshots rows from logs.
 *
 * ?userId=<uuid>          — snapshot last month for one user
 * ?userId=<uuid>&month=YYYY-MM-DD — snapshot a specific month for one user
 * ?force=true             — re-snapshot last month for ALL users (ignores computed_at)
 * (no params)             — normal monthly run (all users with activity last month)
 *
 * Production schedule: EventBridge → Lambda (taste-snapshot-scheduler) → SQS.
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
  const month = request.nextUrl.searchParams.get("month");
  const force = request.nextUrl.searchParams.get("force") === "true";

  if (userId) {
    if (!isValidUuid(userId)) return apiBadRequest("invalid userId");

    const targetMonth = month ?? monthStart(
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)),
    );

    const result = await snapshotUserMonth(userId, targetMonth);
    return apiOk({ ok: true, userId, month: targetMonth, hasData: !!result });
  }

  if (force) {
    const admin = createSupabaseAdminClient();
    const now = new Date();

    const months = [1, 2, 3].map((n) =>
      monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1))),
    );

    const { data: users } = await admin.from("users").select("id");
    const userIds = (users ?? []).map((r) => r.id as string);

    let processed = 0, skipped = 0, errors = 0;
    for (const uid of userIds) {
      for (const isoMonth of months) {
        try {
          const result = await snapshotUserMonth(uid, isoMonth);
          if (result) processed++;
          else skipped++;
        } catch {
          errors++;
        }
      }
    }
    return apiOk({ ok: true, months, processed, skipped, errors });
  }

  const result = await snapshotAllUsersLastMonth();
  return apiOk(result);
}
