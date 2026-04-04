import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { markNotificationsRead } from "@/lib/queries";
import { apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

/** POST /api/notifications/mark-read. Body: { notification_ids?: string[] }. Mark all or specified as read. Auth required. */
export const POST = withHandler(async (request: NextRequest, { user: me }) => {
  const { data: body } = await parseBody<{ notification_ids?: string[] }>(request);

  await markNotificationsRead(me!.id, body?.notification_ids);

  console.log("[notifications] mark-notifications-read", {
    userId: me!.id,
    notificationIds: body?.notification_ids ?? "all",
  });

  return apiOk({ ok: true });
}, { requireAuth: true });
