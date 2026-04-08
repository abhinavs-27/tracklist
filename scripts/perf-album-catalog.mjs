#!/usr/bin/env node
/**
 * Rough comparison of album route latency when catalog is warm vs cold.
 * Cold: first request after deploy or a rare Spotify id may trigger `getOrFetchAlbum` network.
 * Warm: repeat the same URL twice; second should be faster if DB/Spotify cache is hot.
 *
 * Usage:
 *   export TRACKLIST_SESSION_COOKIE='...'   # optional if album is public
 *   node scripts/perf-album-catalog.mjs /album/<spotify-or-uuid-id>
 *
 * Example:
 *   node scripts/perf-album-catalog.mjs /album/4aawyAB9vmqN3uQFF0op2F
 */

const base = process.env.BASE_URL?.replace(/\/$/, "") || "http://localhost:3000";
const cookie = process.env.TRACKLIST_SESSION_COOKIE?.trim();

const pathArg = process.argv[2];
if (!pathArg?.startsWith("/album/")) {
  console.error("Usage: node scripts/perf-album-catalog.mjs /album/<id>");
  process.exit(1);
}

async function timePage(label) {
  const url = `${base}${pathArg}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: "manual",
  });
  const ms = performance.now() - t0;
  const len = (await res.text()).length;
  console.log(
    `${label.padEnd(14)} ${ms.toFixed(1)}ms  status=${res.status}  bytes=${len}`,
  );
}

async function main() {
  console.log(`GET ${base}${pathArg}`);
  await timePage("request-1");
  await timePage("request-2");
  console.log(
    "\nInterpret: large gap between 1 and 2 often suggests cold catalog / Spotify on first request.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
