import type { Request } from "express";
import { getToken } from "next-auth/jwt";
import { getSupabase } from "./supabase";

export type SessionPayload = { id: string; username: string | null };

function generateUsernameFromEmail(email: string): string {
  const base = email
    .split("@")[0]
    .replace(/[^a-zA-Z0-9]/g, "_")
    .toLowerCase()
    .slice(0, 20);
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Resolve the app user id from the NextAuth JWT (cookie on web) or Supabase access token (mobile Bearer).
 */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const s = await getSession(req);
  return s?.id ?? null;
}

/** User id + username when present (matches NextAuth callbacks / `public.users`). */
export async function getSession(req: Request): Promise<SessionPayload | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (secret) {
    try {
      const token = await getToken({ req, secret });
      if (token) {
        const id =
          typeof (token as { id?: string }).id === "string"
            ? (token as { id: string }).id
            : typeof token.sub === "string"
              ? token.sub
              : null;
        if (id) {
          const username =
            typeof (token as { username?: string }).username === "string"
              ? (token as { username: string }).username
              : null;
          return { id, username };
        }
      }
    } catch {
      /* ignore */
    }
  }

  const raw = req.headers.authorization;
  if (typeof raw !== "string" || !raw.startsWith("Bearer ")) {
    return null;
  }
  const jwt = raw.slice(7);

  try {
    const supabase = getSupabase();
    const { data: authData, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !authData.user?.email) {
      return null;
    }
    const email = authData.user.email;

    let { data: dbUser } = await supabase
      .from("users")
      .select("id, username")
      .eq("email", email)
      .maybeSingle();

    if (!dbUser) {
      const username = generateUsernameFromEmail(email);
      const meta = authData.user.user_metadata ?? {};
      const avatar =
        (typeof meta.avatar_url === "string" && meta.avatar_url) ||
        (typeof meta.picture === "string" && meta.picture) ||
        null;

      const { error: insErr } = await supabase.from("users").insert({
        email,
        username,
        avatar_url: avatar,
        bio: null,
      });

      if (insErr && insErr.code !== "23505") {
        console.error("[auth] bearer user insert failed", insErr);
        return null;
      }

      const { data: again } = await supabase
        .from("users")
        .select("id, username")
        .eq("email", email)
        .maybeSingle();

      if (!again) return null;
      dbUser = again;
    }

    return { id: dbUser.id, username: dbUser.username };
  } catch (e) {
    console.error("[auth] bearer session error", e);
    return null;
  }
}
