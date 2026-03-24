import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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
 */
export async function middleware(request: NextRequest) {
  if (isMaintenanceMode()) {
    return maintenanceResponse(request);
  }

  const backend = process.env.API_BACKEND_URL?.trim();
  if (!backend) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (pathname.startsWith("/api/auth")) return NextResponse.next();

  /**
   * Implemented in Next (`app/api/leaderboard/route.ts` + `lib/queries`).
   * Do not proxy — otherwise dev breaks when Express on `API_BACKEND_URL` is not
   * running (middleware `fetch` throws → 500) and duplicates backend logic.
   */
  if (pathname === "/api/leaderboard") return NextResponse.next();

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

  try {
    const res = await fetch(target, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
    });

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
