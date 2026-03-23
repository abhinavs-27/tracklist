import { withHandler } from "@/lib/api-handler";
import { getNotifications } from "@/lib/queries";
import { apiOk } from "@/lib/api-response";

/** GET /api/notifications. Returns { notifications: NotificationRow[] }. Auth required. */
export const GET = withHandler(
  async (request, { user: me }) => {
    const notifications = await getNotifications(me!.id, 50);
    return apiOk({ notifications });
  },
  { requireAuth: true },
);
