import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiError } from "@/lib/api-response";
import { sendBillboardWeeklyDigestEmail } from "@/lib/email/send-billboard-weekly-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * After user + community weekly charts (Sun 05:00 / 06:00 UTC), send digest emails.
 * Schedule in `vercel.json` (Sun 07:00 UTC) — one hour after community charts.
 * Requires `RESEND_API_KEY` and `RESEND_FROM` (e.g. `Tracklist <billboard@yourdomain>`).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiUnauthorized();
    }
  }

  try {
    const admin = createSupabaseAdminClient();

    const { data: latestRow, error: latestErr } = await admin
      .from("user_weekly_charts")
      .select("week_start")
      .eq("chart_type", "tracks")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr || !latestRow?.week_start) {
      return apiOk({
        ok: true,
        skipped: true,
        reason: "no_chart_week",
      });
    }

    const weekStart = latestRow.week_start as string;

    const { data: chartRows, error: chartErr } = await admin
      .from("user_weekly_charts")
      .select("user_id")
      .eq("chart_type", "tracks")
      .eq("week_start", weekStart);

    if (chartErr) {
      console.error("[cron] billboard-weekly-email charts", chartErr);
      return apiError("Chart lookup failed", 500);
    }

    const userIds = [
      ...new Set(
        (chartRows ?? []).map((r: { user_id: string }) => r.user_id),
      ),
    ];

    let sent = 0;
    let skippedAlready = 0;
    let skippedNoEmail = 0;

    for (const userId of userIds) {
      const { data: userRow, error: userErr } = await admin
        .from("users")
        .select("email, billboard_weekly_email_last_week")
        .eq("id", userId)
        .maybeSingle();

      if (userErr || !userRow?.email) {
        skippedNoEmail += 1;
        continue;
      }

      if (userRow.billboard_weekly_email_last_week === weekStart) {
        skippedAlready += 1;
        continue;
      }

      const sendResult = await sendBillboardWeeklyDigestEmail({
        userId,
        email: userRow.email,
        weekStart,
      });

      if (sendResult.ok) {
        const { error: upErr } = await admin
          .from("users")
          .update({ billboard_weekly_email_last_week: weekStart })
          .eq("id", userId);
        if (upErr) {
          console.error("[cron] billboard-weekly-email update", upErr);
        } else {
          sent += 1;
        }
      }
    }

    return apiOk({
      ok: true,
      week_start: weekStart,
      candidates: userIds.length,
      sent,
      skippedAlready,
      skippedNoEmail,
    });
  } catch (e) {
    console.error("[cron] billboard-weekly-email", e);
    return apiError("Billboard email cron failed", 500);
  }
}
