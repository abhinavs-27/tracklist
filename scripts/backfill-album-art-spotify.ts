/**
 * Re-fetch album artwork from Spotify for albums in your listening history so
 * `albums.image_url` uses the largest `images[]` entry (via upsertAlbumFromSpotify).
 *
 * Uses the same Spotify Web API path as the app (`getAlbum` → catalog limiter in
 * @tracklist/spotify-client). Processes **sequentially** with an optional gap to stay
 * gentle next to other traffic.
 *
 * Usage (from repo root, with .env loaded):
 *
 *   NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' npx tsx scripts/backfill-album-art-spotify.ts -- --user-id YOUR_USER_UUID
 *
 * Or via npm script:
 *
 *   npm run backfill:album-art -- --user-id YOUR_USER_UUID
 *
 * Options:
 *   --user-id <uuid>   Required. Supabase `users.id` / `auth.users` id.
 *   --limit <n>        Max distinct Spotify albums to refresh (default 500).
 *   --gap-ms <n>       Pause between albums (default 350). Set 0 to rely only on API limiter.
 *   --dry-run          List Spotify album ids that would be refreshed, no API writes.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createSupabaseAdminClient } from "../lib/supabase-admin";
import { getAlbum } from "../lib/spotify";
import { upsertAlbumFromSpotify } from "../lib/spotify-cache";
import { isValidSpotifyId } from "../lib/validation";

function loadEnvFile() {
  const p = path.join(process.cwd(), ".env");
  try {
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* no .env */
  }
}

function parseArgs(argv: string[]) {
  let userId = "";
  let limit = 500;
  let gapMs = 350;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--user-id="))
      userId = a.slice("--user-id=".length).trim();
    else if (a === "--user-id" && argv[i + 1]) userId = argv[++i]!.trim();
    else if (a.startsWith("--limit="))
      limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 500);
    else if (a === "--limit" && argv[i + 1])
      limit = Math.max(1, parseInt(argv[++i]!, 10) || 500);
    else if (a.startsWith("--gap-ms="))
      gapMs = Math.max(0, parseInt(a.slice("--gap-ms=".length), 10) || 350);
    else if (a === "--gap-ms" && argv[i + 1])
      gapMs = Math.max(0, parseInt(argv[++i]!, 10) || 350);
  }
  return { userId, limit, gapMs, dryRun };
}

async function main() {
  loadEnvFile();
  const { userId, limit, gapMs, dryRun } = parseArgs(process.argv.slice(2));

  if (!userId?.trim()) {
    console.error(
      "Missing --user-id <uuid>. Example: npm run backfill:album-art -- --user-id YOUR_UUID",
    );
    process.exit(1);
  }

  if (!process.env.SPOTIFY_CLIENT_ID?.trim() || !process.env.SPOTIFY_CLIENT_SECRET?.trim()) {
    console.error("Need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env");
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL?.trim() && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    console.error("Need SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("Need SUPABASE_SERVICE_ROLE_KEY in .env for admin");
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("track_id")
    .eq("user_id", userId)
    .limit(50_000);

  if (logErr) {
    console.error("[backfill-album-art] logs query failed", logErr);
    process.exit(1);
  }

  const trackIds = [
    ...new Set(
      (logRows ?? [])
        .map((r) => (r as { track_id: string }).track_id)
        .filter(Boolean),
    ),
  ];

  if (trackIds.length === 0) {
    console.log("[backfill-album-art] no tracks in logs for this user.");
    process.exit(0);
  }

  const { data: trackRows, error: trErr } = await admin
    .from("tracks")
    .select("id, album_id")
    .in("id", trackIds);

  if (trErr) {
    console.error("[backfill-album-art] tracks query failed", trErr);
    process.exit(1);
  }

  const albumIds = [
    ...new Set(
      (trackRows ?? [])
        .map((r) => (r as { album_id: string | null }).album_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (albumIds.length === 0) {
    console.log("[backfill-album-art] no album_id on user’s tracks.");
    process.exit(0);
  }

  const { data: extRows, error: extErr } = await admin
    .from("album_external_ids")
    .select("album_id, external_id")
    .eq("source", "spotify")
    .in("album_id", albumIds);

  if (extErr) {
    console.error("[backfill-album-art] album_external_ids query failed", extErr);
    process.exit(1);
  }

  const spotifyAlbumIds = [
    ...new Set(
      (extRows ?? [])
        .map((r) => (r as { external_id: string }).external_id)
        .filter((id) => isValidSpotifyId(id)),
    ),
  ].slice(0, limit);

  console.log("[backfill-album-art] summary", {
    userId,
    distinctLogs: trackIds.length,
    distinctAlbums: albumIds.length,
    SpotifyLinkedAlbums: spotifyAlbumIds.length,
    limit,
    gapMs,
    dryRun,
  });

  if (dryRun) {
    console.log("[backfill-album-art] dry-run spotify album ids:", spotifyAlbumIds.join("\n"));
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < spotifyAlbumIds.length; i++) {
    const sid = spotifyAlbumIds[i]!;
    try {
      const albumResp = await getAlbum(sid, { skipCache: true });
      await upsertAlbumFromSpotify(admin, albumResp);
      ok += 1;
      if ((i + 1) % 25 === 0) {
        console.log("[backfill-album-art] progress", { done: i + 1, total: spotifyAlbumIds.length, ok, failed });
      }
    } catch (e) {
      failed += 1;
      console.warn("[backfill-album-art] failed", {
        spotifyAlbumId: sid,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (gapMs > 0 && i < spotifyAlbumIds.length - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  console.log("[backfill-album-art] done", { ok, failed, total: spotifyAlbumIds.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
