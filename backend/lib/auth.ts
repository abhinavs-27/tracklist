import type { Request } from "express";
import { getToken } from "next-auth/jwt";

export type SessionPayload = { id: string; username: string | null };

/**
 * Resolve the app user id from the NextAuth JWT (cookie on web, forwarded Cookie header from clients).
 */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const s = await getSession(req);
  return s?.id ?? null;
}

/** User id + username when present on the JWT (matches NextAuth callbacks). */
export async function getSession(req: Request): Promise<SessionPayload | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  try {
    const token = await getToken({ req, secret });
    if (!token) return null;
    const id =
      typeof (token as { id?: string }).id === "string"
        ? (token as { id: string }).id
        : typeof token.sub === "string"
          ? token.sub
          : null;
    if (!id) return null;
    const username =
      typeof (token as { username?: string }).username === "string"
        ? (token as { username: string }).username
        : null;
    return { id, username };
  } catch {
    return null;
  }
}
