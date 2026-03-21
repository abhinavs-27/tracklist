import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { markNotificationsRead } from "@/lib/queries";
import { apiInternalError, apiNoContent } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

/** POST /api/notifications/mark-read. Body: { notification_ids?: string[] }. Mark all or specified as read. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { data: body } = await parseBody<{ notification_ids?: string[] }>(request);

    await markNotificationsRead(me.id, body?.notification_ids);

    console.log("[notifications] mark-notifications-read", {
      userId: me.id,
      notificationIds: body?.notification_ids ?? "all",
    });

    return apiNoContent();
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
