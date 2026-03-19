import { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

/** POST /api/notifications/mark-read. Body: { notification_ids?: string[] }. Mark all or specified as read. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { data: body } = await parseBody<{ notification_ids?: string[] }>(request);

    await markNotificationsRead(session.user.id, body?.notification_ids);

    console.log("[notifications] mark-notifications-read", {
      userId: session.user.id,
      notificationIds: body?.notification_ids ?? "all",
    });

    return apiOk({ ok: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
