import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { markNotificationsRead } from "@/lib/queries";
import { apiUnauthorized, apiInternalError } from "@/lib/api-response";

/** POST /api/notifications/mark-read. Body: { notification_ids?: string[] }. Mark all or specified as read. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();
    let body: { notification_ids?: string[] } = {};
    try {
      body = await request.json();
    } catch {
      // optional body
    }
    await markNotificationsRead(session.user.id, body.notification_ids);
    console.log("[notifications] notifications marked read", {
      userId: session.user.id,
      count: body.notification_ids?.length ?? "all",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
