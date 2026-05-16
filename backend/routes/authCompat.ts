import { Router } from "express";
import { getSession } from "../lib/auth";
import { ok } from "../lib/http";

/**
 * Minimal NextAuth-compatible session JSON for clients that call `GET /api/auth/session`
 * against this backend (must send the same Cookie header as the web app).
 */
export const authCompatRouter = Router();

authCompatRouter.get("/session", async (req, res) => {
  const s = await getSession(req);
  if (!s) {
    return ok(res, {});
  }
  return ok(res, {
    user: {
      id: s.id,
      name: s.username ?? null,
      email: null,
      image: null,
      username: s.username ?? undefined,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
});
