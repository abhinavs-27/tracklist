import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { exchangeSpotifyCode, buildRedirectUriFromOrigin } from "@/lib/spotify-user";
import { getRequestOrigin } from "@/lib/app-url";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      console.error("Spotify OAuth error:", errorParam);
      return NextResponse.json(
        { error: `Spotify OAuth error: ${errorParam}` },
        { status: 400 },
      );
    }

    if (!code || !state) {
      return NextResponse.json(
        { error: "Missing code or state" },
        { status: 400 },
      );
    }

    const cookieState = request.cookies.get("spotify_oauth_state")?.value;
    if (!cookieState || cookieState !== state) {
      console.error("Spotify callback invalid state", {
        hasCookie: !!cookieState,
        match: cookieState === state,
      });
      return NextResponse.json(
        { error: "Invalid OAuth state" },
        { status: 400 },
      );
    }

    const requestOrigin = getRequestOrigin(request);
    const redirectUri = buildRedirectUriFromOrigin(requestOrigin);
    const token = await exchangeSpotifyCode(code, redirectUri);

    if (!token.access_token || !token.expires_in) {
      return NextResponse.json(
        { error: "Invalid token response" },
        { status: 400 },
      );
    }

    const refreshToken = token.refresh_token;
    if (!refreshToken) {
      console.error("Spotify callback missing refresh_token");
      return NextResponse.json(
        { error: "Missing refresh_token (check Spotify app settings)" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: existingToken } = await supabase
      .from("spotify_tokens")
      .select("user_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (existingToken) {
      console.log("[spotify] spotify callback: user already has token, skipping upsert", {
        userId: session.user.id,
      });
      const res = NextResponse.json(
        { connected: true, message: "Spotify is already connected" },
        { status: 200 },
      );
      res.cookies.set("spotify_oauth_state", "", { path: "/", maxAge: 0 });
      res.cookies.set("spotify_oauth_return_to", "", { path: "/", maxAge: 0 });
      return res;
    }

    const expiresAt = new Date(
      Date.now() + token.expires_in * 1000,
    ).toISOString();

    const { error: upsertError } = await supabase.from("spotify_tokens").upsert(
      {
        user_id: session.user.id,
        access_token: token.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (upsertError) {
      console.error("Spotify callback Supabase upsert error:", upsertError);
      return NextResponse.json(
        { error: "Failed to save Spotify token" },
        { status: 500 },
      );
    }

    console.log("[spotify] spotify callback upsert success", {
      userId: session.user.id,
    });

    const cookieReturnTo = request.cookies.get(
      "spotify_oauth_return_to",
    )?.value;
    const fallback = `/profile/${session.user.username ?? ""}`;
    const base = requestOrigin;
    const returnToQuery =
      cookieReturnTo &&
      cookieReturnTo.startsWith("/") &&
      !cookieReturnTo.startsWith("//")
        ? cookieReturnTo
        : fallback;

    const returnTo = base + returnToQuery;

    console.log("[spotify] spotify callback redirecting", { userId: session.user.id, returnTo });

    const res = NextResponse.redirect(returnTo, { status: 302 });
    res.cookies.set("spotify_oauth_state", "", { path: "/", maxAge: 0 });
    res.cookies.set("spotify_oauth_return_to", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    console.error("Spotify callback unexpected error:", e);
    return NextResponse.json(
      { error: "Spotify callback failed" },
      { status: 500 },
    );
  }
}
