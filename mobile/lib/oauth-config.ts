import * as Linking from "expo-linking";

const DEFAULT_NATIVE_REDIRECT = "tracklist://auth/callback";

/**
 * Web: Expo dev/prod URL for `/auth/callback` (must be allowlisted in Supabase).
 */
export function getWebOAuthRedirectUrl(): string {
  return Linking.createURL("/auth/callback");
}

/**
 * Native (iOS/Android): custom scheme so `ASWebAuthenticationSession` uses `callbackURLScheme`
 * reliably. Must match `expo.scheme` in app.json and Supabase Redirect URLs.
 */
export function getNativeOAuthRedirectUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_NATIVE_OAUTH_REDIRECT_URI?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_NATIVE_REDIRECT;
}

/**
 * HTTPS Supabase callback (optional detection for Linking / testing).
 */
export function getSupabaseOAuthCallbackUrl(): string {
  const override = process.env.EXPO_PUBLIC_SUPABASE_OAUTH_REDIRECT_URL?.trim();
  if (override) {
    return override.replace(/\/$/, "");
  }
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
  if (!base) {
    return "";
  }
  return `${base}/auth/v1/callback`;
}

/** Native app OAuth return URL (custom scheme). */
export function isNativeOAuthRedirectUrl(url: string): boolean {
  const base = getNativeOAuthRedirectUrl();
  if (!url || !base) return false;
  return url === base || url.startsWith(`${base}?`) || url.startsWith(`${base}#`);
}
