import "server-only";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { getSession } from "./get-session";
import { apiUnauthorized } from "@/lib/api-response";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { normalizeEmail, generateUsernameFromEmail } from "./utils";
import { isValidUuid } from "@/lib/validation";
import type { User } from "@/types";

export { normalizeEmail, type User };

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

function rowToUser(row: {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
}): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    avatar_url: row.avatar_url,
    bio: row.bio,
    created_at: row.created_at,
  };
}

type ProfileHints = {
  name?: string | null;
  image?: string | null;
};

/**
 * Lookup `public.users` by normalized email; insert if missing.
 * On existing rows, fills missing avatar when a provider image is available.
 */
export async function findOrCreateUser(
  rawEmail: string,
  options?: { profile?: ProfileHints },
): Promise<User> {
  const email = normalizeEmail(rawEmail);
  if (!email) {
    throw new Error("Invalid email");
  }

  const supabase = createSupabaseServiceRoleClient();

  const { data: existing, error: selErr } = await supabase
    .from("users")
    .select("id, email, username, avatar_url, bio, created_at")
    .eq("email", email)
    .maybeSingle();

  if (selErr) {
    console.error("[findOrCreateUser] select", selErr);
    throw selErr;
  }

  if (existing) {
    const image = options?.profile?.image ?? null;
    if (image && !existing.avatar_url) {
      const { data: patched, error: upErr } = await supabase
        .from("users")
        .update({ avatar_url: image })
        .eq("id", existing.id)
        .select("id, email, username, avatar_url, bio, created_at")
        .single();
      if (!upErr && patched) return rowToUser(patched);
    }
    return rowToUser(existing);
  }

  const username = generateUsernameFromEmail(email);
  const avatar = options?.profile?.image ?? null;

  const { data: inserted, error: insErr } = await supabase
    .from("users")
    .insert({
      email,
      username,
      avatar_url: avatar,
      bio: null,
    })
    .select("id, email, username, avatar_url, bio, created_at")
    .single();

  if (insErr?.code === "23505") {
    const { data: again } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .eq("email", email)
      .maybeSingle();
    if (again) return rowToUser(again);
  }

  if (insErr || !inserted) {
    console.error("[findOrCreateUser] insert", insErr);
    throw insErr ?? new Error("Failed to create user");
  }

  return rowToUser(inserted);
}

function getAuthorizationHeader(
  request?: NextRequest | Request | null,
): string | null {
  const fromReq = request?.headers.get("authorization");
  if (fromReq) return fromReq;
  return null;
}

/**
 * Resolve the authenticated user from NextAuth (cookie) or Supabase access token (Bearer).
 * Returns null if unauthenticated or on recoverable errors (invalid token, etc.).
 */
export async function getUserFromRequest(
  request?: NextRequest | Request | null,
): Promise<User | null> {
  try {
    const session = await getSession();
    const sessionEmail = session?.user?.email;
    if (
      session &&
      typeof sessionEmail === "string" &&
      sessionEmail.length > 0
    ) {
      const su = session.user;
      const image =
        su.image ??
        ("avatar_url" in su &&
        typeof (su as { avatar_url?: string }).avatar_url === "string"
          ? (su as { avatar_url: string }).avatar_url
          : null);
      return await findOrCreateUser(sessionEmail, {
        profile: {
          name: su.name ?? null,
          image,
        },
      });
    }

    /** Email sometimes missing from the session; resolve by stable DB id if present. */
    const sessionUserId =
      session?.user &&
      typeof (session.user as { id?: string }).id === "string"
        ? (session.user as { id: string }).id
        : null;
    if (sessionUserId && isValidUuid(sessionUserId)) {
      const supabase = createSupabaseServiceRoleClient();
      const { data: byId, error: byIdErr } = await supabase
        .from("users")
        .select("id, email, username, avatar_url, bio, created_at")
        .eq("id", sessionUserId)
        .maybeSingle();
      if (!byIdErr && byId) {
        return rowToUser(byId);
      }
    }

    let authHeader = getAuthorizationHeader(request);
    if (!authHeader) {
      const h = await headers();
      authHeader = h.get("authorization");
    }

    if (!authHeader?.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const supabase = createSupabaseServiceRoleClient();
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData.user?.email) {
      return null;
    }

    const u = authData.user;
    const bearerEmail = u.email;
    if (!bearerEmail) return null;

    const meta = u.user_metadata ?? {};
    const image =
      (typeof meta.avatar_url === "string" && meta.avatar_url) ||
      (typeof meta.picture === "string" && meta.picture) ||
      null;

    return await findOrCreateUser(bearerEmail, {
      profile: {
        name:
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.name === "string" && meta.name) ||
          null,
        image,
      },
    });
  } catch (e) {
    console.error("[getUserFromRequest]", e);
    return null;
  }
}

/**
 * Resolves `public.users.id` for DB writes (reactions, etc.).
 * Always prefers email → {@link findOrCreateUser} so the FK targets `public.users`,
 * not a stale `session.user.id` (JWT can desync from `public.users`; do not confuse
 * with `auth.users` in the Supabase dashboard).
 *
 * Email is taken from `me`, then the signed JWT cookie via `getToken`, then {@link getSession}.
 */
export async function resolveUserIdForMutation(
  me: User,
  request?: NextRequest | Request | null,
): Promise<string | null> {
  const tryEmail = async (raw: string | null | undefined): Promise<string | null> => {
    const e = raw?.trim();
    if (!e) return null;
    try {
      return (await findOrCreateUser(e, { profile: {} })).id;
    } catch (err) {
      console.error("[resolveUserIdForMutation] findOrCreateUser", err);
      return null;
    }
  };

  let resolved = await tryEmail(me.email);
  if (resolved) return resolved;

  const secret = process.env.NEXTAUTH_SECRET;
  if (request && secret) {
    try {
      const token = await getToken({
        req: request as Parameters<typeof getToken>[0]["req"],
        secret,
      });
      resolved = await tryEmail(
        typeof token?.email === "string" ? token.email : undefined,
      );
      if (resolved) return resolved;
    } catch (e) {
      console.error("[resolveUserIdForMutation] getToken", e);
    }
  }

  resolved = await tryEmail(
    (await getSession())?.user?.email ?? undefined,
  );
  if (resolved) return resolved;

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", me.id)
    .maybeSingle();
  if (error) {
    console.error("[resolveUserIdForMutation] users by id", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Same as {@link getUserFromRequest}, but throws {@link UnauthorizedError} when unauthenticated.
 */
export async function requireApiAuth(
  request?: NextRequest | Request | null,
): Promise<User> {
  const user = await getUserFromRequest(request);
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

/** Use in route `catch` blocks: `if (handleUnauthorized(e)) return handleUnauthorized(e)!` or check null. */
export function handleUnauthorized(e: unknown): NextResponse | null {
  if (e instanceof UnauthorizedError) {
    return apiUnauthorized();
  }
  return null;
}
