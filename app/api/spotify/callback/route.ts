import { NextRequest, NextResponse } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { exchangeSpotifyCode, buildRedirectUriFromOrigin } from "@/lib/spotify-user";
import { getRequestOrigin } from "@/lib/app-url";
import { apiBadRequest, apiError, apiOk } from "@/lib/api-response";
import {
  isSpotifyIntegrationEnabled,
  SPOTIFY_DISABLED_API_MESSAGE,
} from "@/lib/spotify-integration-enabled";

export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    if (!isSpotifyIntegrationEnabled()) {
      return apiBadRequest(SPOTIFY_DISABLED_API_MESSAGE);
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      console.error("Spotify OAuth error:", errorParam);
      return apiBadRequest(`Spotify OAuth error: ${errorParam}`);
    }

    if (!code || !state) {
      return apiBadRequest("Missing code or state");
    }

    const cookieState = request.cookies.get("spotify_oauth_state")?.value;
    if (!cookieState || cookieState !== state) {
      console.error("Spotify callback invalid state", {
        hasCookie: !!cookieState,
        match: cookieState === state,
      });
      return apiBadRequest("Invalid OAuth state");
    }

    const requestOrigin = getRequestOrigin(request);
    const redirectUri = buildRedirectUriFromOrigin(requestOrigin);
    const token = await exchangeSpotifyCode(code, redirectUri);

    if (!token.access_token || !token.expires_in) {
      return apiBadRequest("Invalid token response");
    }

    const refreshToken = token.refresh_token;
    if (!refreshToken) {
      console.error("Spotify callback missing refresh_token");
      return apiBadRequest("Missing refresh_token (check Spotify app settings)");
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingToken } = await supabase
      .from("spotify_tokens")
      .select("user_id")
      .eq("user_id", me.id)
      .maybeSingle();

    if (existingToken) {
      console.log("[spotify-ingest] spotify-callback-token-exists", {
        userId: me.id,
      });
      const res = apiOk({ connected: true, message: "Spotify is already connected" });
      res.cookies.set("spotify_oauth_state", "", { path: "/", maxAge: 0 });
      res.cookies.set("spotify_oauth_return_to", "", { path: "/", maxAge: 0 });
      return res;
    }

    const expiresAt = new Date(
      Date.now() + token.expires_in * 1000,
    ).toISOString();

    const { error: upsertError } = await supabase.from("spotify_tokens").upsert(
      {
        user_id: me.id,
        access_token: token.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertError) {
      console.error("Spotify callback Supabase upsert error:", upsertError);
      return apiError("Failed to save Spotify token", 500);
    }

    console.log("[spotify-ingest] spotify-callback-upsert-success", {
      userId: me.id,
    });

    const cookieReturnTo = request.cookies.get(
      "spotify_oauth_return_to",
    )?.value;
    const fallback = `/profile/${me.id ?? ""}`;
    const base = requestOrigin;
    const returnToQuery =
      cookieReturnTo &&
      cookieReturnTo.startsWith("/") &&
      !cookieReturnTo.startsWith("//")
        ? cookieReturnTo
        : fallback;

    const returnTo = base + returnToQuery;

    console.log("[spotify-ingest] spotify-callback-redirect", { userId: me.id, returnTo });

    const res = NextResponse.redirect(returnTo, { status: 302 });
    res.cookies.set("spotify_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("spotify_oauth_return_to", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    console.error("Spotify callback unexpected error:", e);
    return apiError("Spotify callback failed", 500);
  }
}
