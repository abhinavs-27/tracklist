import { Router } from "express";
import { getSessionUserId } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import {
  unauthorized,
  internalError,
  ok,
  badRequest,
} from "../lib/http";
import {
  listNotifications,
  markNotificationsRead,
} from "../services/notificationsService";

export const notificationsRouter = Router();

/** GET /api/notifications — same contract as Next.js route. */
notificationsRouter.get("/notifications", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    if (!isSupabaseConfigured()) {
      return badRequest(res, "Supabase is not configured on this server");
    }

    const supabase = getSupabase();
    const notifications = await listNotifications(supabase, userId, 50, 0);
    return ok(res, { notifications });
  } catch (e) {
    return internalError(res, e);
  }
});

/** POST /api/notifications/mark-read */
notificationsRouter.post("/notifications/mark-read", async (req, res) => {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return unauthorized(res);

    if (!isSupabaseConfigured()) {
      return badRequest(res, "Supabase is not configured on this server");
    }

    const body = req.body as { notification_ids?: string[] } | undefined;
    const supabase = getSupabase();
    await markNotificationsRead(supabase, userId, body?.notification_ids);

    return ok(res, { ok: true });
  } catch (e) {
    return internalError(res, e);
  }
});
