import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import {
  getNativeOAuthRedirectUrl,
  getWebOAuthRedirectUrl,
} from "./oauth-config";
import { getSessionFromUrl } from "./get-session-from-url";

const LOG = "[oauth]";

function logSignInWithOAuth(
  platform: string,
  redirectTo: string,
  data: { url?: string | null } | null,
  error: { message?: string } | null,
) {
  console.log(`${LOG} signInWithOAuth (${platform}) redirectTo:`, redirectTo);
  console.log(`${LOG} signInWithOAuth (${platform}) error:`, error ?? null);
  console.log(`${LOG} signInWithOAuth (${platform}) data.url:`, data?.url ?? null);
}

/** Log redirect_uri embedded in the OAuth authorize URL (should match app redirectTo). */
function logRedirectUriFromAuthorizeUrl(oauthUrl: string | null | undefined) {
  if (!oauthUrl) return;
  try {
    const u = new URL(oauthUrl);
    const redirectUri = u.searchParams.get("redirect_uri");
    console.log(`${LOG} OAuth authorize URL redirect_uri param:`, redirectUri);
  } catch {
    /* ignore */
  }
}

type AuthSessionResult = {
  type: string;
  url?: string;
  error?: string | null;
};

function logAuthSessionResult(result: AuthSessionResult) {
  try {
    console.log(`${LOG} openAuthSessionAsync full result:`, JSON.stringify(result));
  } catch {
    console.log(`${LOG} openAuthSessionAsync result (non-serializable):`, result);
  }
  if (result.error != null && result.error !== "") {
    console.warn(`${LOG} openAuthSessionAsync native error:`, result.error);
  }
}

export type SignInWithGoogleResult = {
  error: Error | null;
  /** User closed the browser / cancelled (not a failure). */
  cancelled?: boolean;
};

/**
 * Google OAuth via Supabase.
 * - Web: `getWebOAuthRedirectUrl()` + full-page redirect.
 * - Native: `getNativeOAuthRedirectUrl()` (custom scheme) + `openAuthSessionAsync`.
 */
export async function signInWithGoogleOAuth(): Promise<SignInWithGoogleResult> {
  try {
    if (Platform.OS === "web") {
      const redirectTo = getWebOAuthRedirectUrl();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
        },
      });
      logSignInWithOAuth("web", redirectTo, data, error);
      logRedirectUriFromAuthorizeUrl(data?.url ?? undefined);
      if (error) return { error: new Error(error.message) };
      if (!data.url) return { error: new Error("No OAuth URL returned") };
      if (typeof window !== "undefined") {
        window.location.assign(data.url);
      }
      return { error: null };
    }

    const redirectTo = getNativeOAuthRedirectUrl();
    if (!redirectTo) {
      return {
        error: new Error("Native OAuth redirect URL is not configured"),
      };
    }

    console.log(`${LOG} native redirectTo:`, redirectTo);

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    logSignInWithOAuth("native", redirectTo, data, error);
    logRedirectUriFromAuthorizeUrl(data?.url ?? undefined);

    if (error) return { error: new Error(error.message) };
    if (!data.url) return { error: new Error("No OAuth URL returned") };

    const result = (await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo,
      { preferEphemeralSession: false },
    )) as AuthSessionResult;

    logAuthSessionResult(result);
    console.log(`${LOG} openAuthSessionAsync result.type:`, result.type);

    if (result.type === "cancel" || result.type === "dismiss") {
      const nativeErr = result.error;
      if (typeof nativeErr === "string" && nativeErr.length > 0) {
        return { error: new Error(nativeErr) };
      }
      return { error: null, cancelled: true };
    }

    if (result.type === "success" && result.url) {
      console.log(`${LOG} callback result.url:`, result.url);
      const { error: sessionError } = await getSessionFromUrl({
        url: result.url,
        storeSession: true,
      });
      if (sessionError) {
        console.warn(`${LOG} getSessionFromUrl error:`, sessionError.message);
      }
      return {
        error: sessionError ? new Error(sessionError.message) : null,
      };
    }

    return { error: new Error("OAuth did not complete") };
  } catch (e) {
    console.warn(`${LOG} signInWithGoogleOAuth threw:`, e);
    return {
      error: e instanceof Error ? e : new Error(String(e)),
    };
  }
}

/** Call once at app root so returning from Safari hands off to the app (native). */
export function maybeCompleteAuthSession() {
  WebBrowser.maybeCompleteAuthSession();
}
