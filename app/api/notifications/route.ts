import { withHandler } from "@/lib/api-handler";
import { getNotifications } from "@/lib/queries";
import { apiOk } from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";

/** GET /api/notifications. Returns { notifications: NotificationRow[] }. Auth required. */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const { limit, offset } = getPaginationParams(searchParams, 50, 100);

    const notifications = await getNotifications(me!.id, limit, offset);
    return apiOk({ notifications });
  },
  { requireAuth: true },
);
