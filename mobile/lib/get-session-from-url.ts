import * as Linking from "expo-linking";
import type { AuthError, Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import {
  getSupabaseOAuthCallbackUrl,
  isNativeOAuthRedirectUrl,
} from "./oauth-config";

/** Avoid double exchange when WebBrowser + Linking both receive the same redirect. */
let lastExchangedCode: string | null = null;
let lastExchangeAt = 0;

function extractAuthCode(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const code = parsed.queryParams?.code;
    if (typeof code === "string" && code.length > 0) return code;
  } catch {
    /* fall through */
  }
  try {
    return new URL(url).searchParams.get("code");
  } catch {
    return null;
  }
}

/**
 * PKCE / hash session completion when `supabase.auth.getSessionFromUrl` is unavailable.
 */
async function finishOAuthSessionFromUrl(options: {
  url: string;
  storeSession?: boolean;
}): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
  void options.storeSession;
  const url = options.url;
  if (!url) {
    return { data: { session: null }, error: null };
  }

  const code = extractAuthCode(url);
  if (code) {
    const now = Date.now();
    if (code === lastExchangedCode && now - lastExchangeAt < 10_000) {
      const { data } = await supabase.auth.getSession();
      return { data: { session: data.session }, error: null };
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.session) {
      lastExchangedCode = code;
      lastExchangeAt = now;
    }
    return {
      data: { session: data.session ?? null },
      error: error ?? null,
    };
  }

  const hash = url.split("#")[1];
  if (hash) {
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (access_token && refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      return {
        data: { session: data.session ?? null },
        error: error ?? null,
      };
    }
  }

  return { data: { session: null }, error: null };
}

type GetSessionFromUrlFn = (options: {
  url: string;
  storeSession?: boolean;
}) => Promise<{ data: { session: Session | null }; error: AuthError | null }>;

/**
 * Same contract as `supabase.auth.getSessionFromUrl({ url, storeSession: true })`.
 * Uses the SDK method when present; otherwise PKCE exchange + hash fallback.
 */
export async function getSessionFromUrl(options: {
  url: string;
  storeSession?: boolean;
}): Promise<{ data: { session: Session | null }; error: AuthError | null }> {
  const auth = supabase.auth as unknown as {
    getSessionFromUrl?: GetSessionFromUrlFn;
  };
  if (typeof auth.getSessionFromUrl === "function") {
    return auth.getSessionFromUrl(options);
  }
  return finishOAuthSessionFromUrl(options);
}

/** True when the URL is this project’s Supabase `/auth/v1/callback` (with or without query). */
export function isSupabaseOAuthCallbackUrl(url: string): boolean {
  const expected = getSupabaseOAuthCallbackUrl();
  if (!expected || !url) return false;
  try {
    const u = new URL(url);
    const e = new URL(expected);
    return u.origin === e.origin && u.pathname === e.pathname;
  } catch {
    return false;
  }
}

/** HTTPS Supabase callback or native `tracklist://auth/callback` return. */
export function isOAuthCallbackUrl(url: string): boolean {
  return isSupabaseOAuthCallbackUrl(url) || isNativeOAuthRedirectUrl(url);
}
