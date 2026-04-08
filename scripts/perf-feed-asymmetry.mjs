#!/usr/bin/env node
/**
 * Compare latency of GET /api/feed (stale-first) vs the same work after RSC would have
 * warmed the cache. Requires a running dev server and a session cookie.
 *
 * Usage:
 *   export TRACKLIST_SESSION_COOKIE='next-auth.session-token=...'
 *   node scripts/perf-feed-asymmetry.mjs
 *
 * Optional:
 *   BASE_URL=http://localhost:3000
 *
 * First request may be "miss" (cold); second should often be "hit" if within TTL.
 */

const base = process.env.BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const cookie = process.env.TRACKLIST_SESSION_COOKIE;

if (!cookie?.trim()) {
  console.error(
    "Set TRACKLIST_SESSION_COOKIE to your browser session cookie (e.g. next-auth.session-token=...).",
  );
  process.exit(1);
}

async function timeFeed(label) {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/feed?limit=50`, {
    headers: { Cookie: cookie.trim() },
  });
  const ms = performance.now() - t0;
  const stale = res.headers.get("x-tracklist-stale-first") ?? "?";
  const ok = res.ok;
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "";
  }
  const json = body.length ? JSON.parse(body) : {};
  const items = Array.isArray(json.items) ? json.items.length : 0;
  console.log(
    `${label.padEnd(14)} ${ms.toFixed(1)}ms  X-Tracklist-Stale-First=${stale}  ok=${ok}  items=${items}`,
  );
  return { ms, stale, ok };
}

async function main() {
  console.log(`BASE_URL=${base}`);
  await timeFeed("request-1");
  await timeFeed("request-2");
  console.log(
    "\nInterpret: first call may be miss; second should be hit if Redis/memory is warm.",
  );
  console.log(
    "Home RSC now uses the same cache key as this request for the initial feed page.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
