import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { getBillboardDropStatus } from "@/lib/billboard-drop/billboard-drop-state";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getLatestWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";

export const GET = withHandler(
  async (_request, { user }) => {
    const status = await getBillboardDropStatus(user!.id);
    return apiOk(status);
  },
  { requireAuth: true },
);

type Body = {
  action?: "dismiss_modal" | "complete_flow" | "ack_chart_view";
  week_start?: string | null;
};

export const POST = withHandler(
  async (request, { user }) => {
    const { data: body, error: parseErr } = await parseBody<Body>(request);
    if (parseErr) return parseErr;

    const action = body?.action;
    if (
      action !== "dismiss_modal" &&
      action !== "complete_flow" &&
      action !== "ack_chart_view"
    ) {
      return apiBadRequest("Invalid action");
    }

    const admin = createSupabaseAdminClient();
    const uid = user!.id;

    const latest = await getLatestWeeklyChartForUser({
      userId: uid,
      chartType: "tracks",
    });
    if (!latest) {
      return apiOk({ ok: true, skipped: true });
    }

    const latestWeek = latest.week_start;

    if (action === "dismiss_modal") {
      const { error } = await admin
        .from("users")
        .update({
          billboard_drop_dismissed_week: latestWeek,
        })
        .eq("id", uid);
      if (error) {
        console.error("[billboard-drop] dismiss", error);
        return apiBadRequest("Could not save");
      }
      return apiOk({ ok: true });
    }

    if (action === "complete_flow") {
      const { error } = await admin
        .from("users")
        .update({
          billboard_drop_ack_week: latestWeek,
          billboard_drop_dismissed_week: null,
        })
        .eq("id", uid);
      if (error) {
        console.error("[billboard-drop] complete", error);
        return apiBadRequest("Could not save");
      }
      return apiOk({ ok: true });
    }

    /** User opened Weekly Billboard for the latest week — treat as acknowledged. */
    if (action === "ack_chart_view") {
      const raw = body?.week_start?.trim();
      if (raw && raw !== latestWeek) {
        return apiOk({ ok: true, skipped: true });
      }
      const { error } = await admin
        .from("users")
        .update({
          billboard_drop_ack_week: latestWeek,
          billboard_drop_dismissed_week: null,
        })
        .eq("id", uid);
      if (error) {
        console.error("[billboard-drop] ack chart", error);
        return apiBadRequest("Could not save");
      }
      return apiOk({ ok: true });
    }

    return apiBadRequest("Invalid action");
  },
  { requireAuth: true },
);
