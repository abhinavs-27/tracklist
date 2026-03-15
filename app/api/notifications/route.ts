import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getNotifications } from "@/lib/queries";
import { apiUnauthorized, apiInternalError, apiOk } from "@/lib/api-response";

/** GET /api/notifications. Returns { notifications: NotificationRow[] }. Auth required. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();
    const notifications = await getNotifications(session.user.id, 50);
    return apiOk({ notifications });
  } catch (e) {
    return apiInternalError(e);
  }
}
