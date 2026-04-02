import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Set `MIDDLEWARE_DEBUG=1` to log timings (dev only recommended). */
function mwDebugEnabled(): boolean {
  return process.env.MIDDLEWARE_DEBUG === "1";
}

function mwLog(phase: string, t0: number): void {
  if (!mwDebugEnabled()) return;
  const ms = Math.round(performance.now() - t0);
  console.log(`[middleware] ${phase} +${ms}ms (total ${ms}ms from start)`);
}

/** Set `MAINTENANCE_MODE=true` in env to show a site-wide maintenance page (503). */
function isMaintenanceMode(): boolean {
  const v = process.env.MAINTENANCE_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tracklist — Under maintenance</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #09090b;
      color: #fafafa;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      padding: 1.5rem;
    }
    .card {
      max-width: 28rem;
      text-align: center;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin: 0 0 0.5rem;
    }
    p {
      margin: 0;
      font-size: 0.9375rem;
      line-height: 1.5;
      color: #a1a1aa;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Under maintenance</h1>
    <p>Tracklist is temporarily unavailable. We’ll be back soon.</p>
  </div>
</body>
</html>`;

function maintenanceResponse(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "maintenance",
        message: "Tracklist is temporarily under maintenance.",
      },
      {
        status: 503,
        headers: { "Retry-After": "3600" },
      },
    );
  }
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "3600",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * When `API_BACKEND_URL` is set, proxy browser/API requests from this Next.js app
 * to the standalone Express backend. NextAuth stays on Next (`/api/auth/*`).
 *
 * Set in `.env` (e.g. `API_BACKEND_URL=http://127.0.0.1:3001`) while Next.js serves
 * the site on port 3000 (default).
 *
 * Note: this path is network-bound (not O(1) latency). Unset `API_BACKEND_URL` when
 * not using the Express bridge to avoid extra hops.
 */
function shouldSkipOnboardingGate(pathname: string): boolean {
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/community/join") ||
    pathname.startsWith("/communities") ||
    pathname.startsWith("/e2e") ||
    pathname === "/favicon.ico"
  ) {
    return true;
  }
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/i.test(pathname)) {
    return true;
  }
  return false;
}

let warnedOnboardingMissingSecret = false;

/**
 * Signed-in users who haven't finished onboarding are sent to `/onboarding`.
 * Uses only the JWT (no DB) — `onboarding_completed` is synced from `users` in the
 * NextAuth `jwt` callback and via `session.update()` after bootstrap.
 */
function onboardingIncompleteRedirect(
  request: NextRequest,
  token: Awaited<ReturnType<typeof getToken>>,
  t0: number,
): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  if (shouldSkipOnboardingGate(pathname)) return null;

  const jwt = token as { id?: string; onboarding_completed?: boolean } | null;
  const userId = typeof jwt?.id === "string" ? jwt.id : null;
  if (!userId || !jwt) return null;

  const done = jwt.onboarding_completed;
  /** Legacy sessions without the claim: do not redirect here (onboarding page still validates server-side). */
  if (done !== false) return null;

  mwLog("onboarding_redirect", t0);
  const dest = request.nextUrl.clone();
  dest.pathname = "/onboarding";
  dest.search = "";
  return NextResponse.redirect(dest);
}

/** When unset or not `1`, `/social/inbox` and `/discover/recommended` redirect to Discover. */
function isSocialInboxAndMusicRecUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FEATURE_SOCIAL_INBOX_MUSIC_REC_UI === "1";
}

export async function middleware(request: NextRequest) {
  const t0 = performance.now();
  mwLog("start", t0);

  if (isMaintenanceMode()) {
    mwLog("maintenance", t0);
    return maintenanceResponse(request);
  }

  if (!isSocialInboxAndMusicRecUiEnabled()) {
    const p = request.nextUrl.pathname;
    if (p === "/social/inbox" || p.startsWith("/social/inbox/")) {
      const dest = request.nextUrl.clone();
      dest.pathname = "/discover";
      dest.search = "";
      return NextResponse.redirect(dest);
    }
    if (
      p === "/discover/recommended" ||
      p.startsWith("/discover/recommended/")
    ) {
      const dest = request.nextUrl.clone();
      dest.pathname = "/discover";
      dest.search = "";
      return NextResponse.redirect(dest);
    }
  }

  const secret = process.env.NEXTAUTH_SECRET;
  let token: Awaited<ReturnType<typeof getToken>> = null;
  if (secret && !shouldSkipOnboardingGate(request.nextUrl.pathname)) {
    const tJwt = performance.now();
    token = await getToken({ req: request, secret });
    mwLog(`getToken(${Math.round(performance.now() - tJwt)}ms)`, t0);
  } else if (!secret && !shouldSkipOnboardingGate(request.nextUrl.pathname)) {
    if (!warnedOnboardingMissingSecret) {
      warnedOnboardingMissingSecret = true;
      console.warn(
        "[middleware] onboarding gate skipped: set NEXTAUTH_SECRET so signed-in users can be checked for incomplete onboarding",
      );
    }
  }

  const onboardingRedirect =
    token && secret
      ? onboardingIncompleteRedirect(request, token, t0)
      : null;
  if (onboardingRedirect) return onboardingRedirect;

  const backend = process.env.API_BACKEND_URL?.trim();
  if (!backend) {
    mwLog("next (no API_BACKEND_URL)", t0);
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    mwLog("next (not /api)", t0);
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/auth")) {
    mwLog("next (/api/auth)", t0);
    return NextResponse.next();
  }

  /**
   * Implemented in Next (`app/api/leaderboard/route.ts` + `lib/queries`).
   * Do not proxy — otherwise dev breaks when Express on `API_BACKEND_URL` is not
   * running (middleware `fetch` throws → 500) and duplicates backend logic.
   */
  if (pathname === "/api/leaderboard") return NextResponse.next();

  /**
   * Reactions use NextAuth session cookies + `app/api/reactions/*` + Supabase.
   * Express does not decode those cookies → proxied POSTs return 401.
   */
  if (pathname.startsWith("/api/reactions")) return NextResponse.next();

  /**
   * Communities + weekly chart PNGs are implemented only in Next (`app/api/communities/*`,
   * `app/api/charts/*`, e.g. `@vercel/og` share-image). If proxied to Express, those paths
   * 404 or mis-handle binary responses — works locally when `API_BACKEND_URL` is unset.
   */
  if (
    pathname.startsWith("/api/communities/") ||
    pathname.startsWith("/api/charts/")
  ) {
    return NextResponse.next();
  }

  const base = backend.replace(/\/$/, "");
  const target = `${base}${pathname}${request.nextUrl.search}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "host" || k === "connection") return;
    headers.set(key, value);
  });

  let body: ArrayBuffer | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    try {
      body = await request.arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  const tFetch = performance.now();
  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    });

    mwLog(`proxy_fetch(${Math.round(performance.now() - tFetch)}ms)`, t0);

    const out = new NextResponse(res.body, { status: res.status });
    res.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "transfer-encoding") return;
      out.headers.set(key, value);
    });
    return out;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error("[middleware] API_BACKEND_URL proxy failed:", target, detail);
    return NextResponse.json(
      {
        error: "API backend unavailable",
        detail:
          process.env.NODE_ENV === "development"
            ? `${detail} (is Express running at ${base}?)`
            : undefined,
      },
      { status: 503 },
    );
  }
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
