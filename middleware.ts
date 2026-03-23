import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * When `API_BACKEND_URL` is set, proxy browser/API requests from this Next.js app
 * to the standalone Express backend. NextAuth stays on Next (`/api/auth/*`).
 *
 * Set in `.env` (e.g. `API_BACKEND_URL=http://127.0.0.1:3001`) while Next.js serves
 * the site on port 3000 (default).
 */
export async function middleware(request: NextRequest) {
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
  matcher: ["/api/:path*"],
};
