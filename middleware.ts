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
}

export const config = {
  matcher: ["/api/:path*"],
};
