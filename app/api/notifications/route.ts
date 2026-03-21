import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { getNotifications } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";

/** GET /api/notifications. Returns { notifications: NotificationRow[] }. Auth required. */
export async function GET() {
  try {
    const me = await requireApiAuth();
    const notifications = await getNotifications(me.id, 50);
    return apiOk({ notifications });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
