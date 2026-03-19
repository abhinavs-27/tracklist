import { requireApiAuth } from "@/lib/auth";
import { getNotifications } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";

/** GET /api/notifications. Returns { notifications: NotificationRow[] }. Auth required. */
export async function GET() {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;
    const notifications = await getNotifications(session.user.id, 50);
    return apiOk({ notifications });
  } catch (e) {
    return apiInternalError(e);
  }
}
