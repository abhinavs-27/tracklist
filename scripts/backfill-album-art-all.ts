/**
 * Re-fetch album artwork from Spotify for ALL albums in the catalog that have a
 * Spotify external ID. Updates `albums.image_url` to the highest-resolution image.
 *
 * Optionally restrict to albums that are missing an image or have a suspiciously
 * small one (use --missing-only to skip albums that already have an image_url).
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' npx tsx scripts/backfill-album-art-all.ts
 *
 * Or via npm script:
 *   npm run backfill:album-art-all
 *
 * Options:
 *   --missing-only     Only process albums where image_url IS NULL (faster, less API usage).
 *   --limit <n>        Max albums to process (default: all).
 *   --gap-ms <n>       Pause between Spotify API calls in ms (default: 300).
 *   --dry-run          Print how many albums would be processed, no writes.
 *   --batch-size <n>   DB page size for fetching album IDs (default: 500).
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
  let missingOnly = false;
  let limit = Infinity;
  let gapMs = 300;
  let dryRun = false;
  let batchSize = 500;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--missing-only") missingOnly = true;
    else if (a === "--dry-run") dryRun = true;
    else if (a.startsWith("--limit="))
      limit = Math.max(1, parseInt(a.slice("--limit=".length), 10) || 1000);
    else if (a === "--limit" && argv[i + 1])
      limit = Math.max(1, parseInt(argv[++i]!, 10) || 1000);
    else if (a.startsWith("--gap-ms="))
      gapMs = Math.max(0, parseInt(a.slice("--gap-ms=".length), 10));
    else if (a === "--gap-ms" && argv[i + 1])
      gapMs = Math.max(0, parseInt(argv[++i]!, 10));
    else if (a.startsWith("--batch-size="))
      batchSize = Math.max(1, parseInt(a.slice("--batch-size=".length), 10) || 500);
    else if (a === "--batch-size" && argv[i + 1])
      batchSize = Math.max(1, parseInt(argv[++i]!, 10) || 500);
  }

  return { missingOnly, limit, gapMs, dryRun, batchSize };
}

async function fetchAllSpotifyAlbumIds(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  missingOnly: boolean,
  batchSize: number,
): Promise<{ albumId: string; spotifyId: string }[]> {
  const results: { albumId: string; spotifyId: string }[] = [];
  let offset = 0;

  while (true) {
    // Join album_external_ids with albums to optionally filter by missing image
    const { data, error } = await admin
      .from("album_external_ids")
      .select("album_id, external_id, albums!inner(image_url)")
      .eq("source", "spotify")
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error("[backfill-all] album_external_ids query failed", error);
      process.exit(1);
    }

    if (!data || data.length === 0) break;

    for (const row of data) {
      const r = row as unknown as {
        album_id: string;
        external_id: string;
        albums: { image_url: string | null } | null;
      };
      if (!isValidSpotifyId(r.external_id)) continue;
      if (missingOnly && r.albums?.image_url) continue;
      results.push({ albumId: r.album_id, spotifyId: r.external_id });
    }

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  return results;
}

async function main() {
  loadEnvFile();
  const { missingOnly, limit, gapMs, dryRun, batchSize } = parseArgs(
    process.argv.slice(2),
  );

  if (
    !process.env.SPOTIFY_CLIENT_ID?.trim() ||
    !process.env.SPOTIFY_CLIENT_SECRET?.trim()
  ) {
    console.error("Need SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env");
    process.exit(1);
  }
  if (
    !process.env.SUPABASE_URL?.trim() &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  ) {
    console.error("Need SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in .env");
    process.exit(1);
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("Need SUPABASE_SERVICE_ROLE_KEY in .env");
    process.exit(1);
  }

  const admin = createSupabaseAdminClient();

  console.log("[backfill-all] fetching album list...");
  const allAlbums = await fetchAllSpotifyAlbumIds(admin, missingOnly, batchSize);

  const toProcess = isFinite(limit)
    ? allAlbums.slice(0, limit)
    : allAlbums;

  console.log("[backfill-all] ready", {
    totalWithSpotifyId: allAlbums.length,
    toProcess: toProcess.length,
    missingOnly,
    gapMs,
    dryRun,
  });

  if (dryRun) {
    console.log("[backfill-all] dry-run complete. Pass without --dry-run to write.");
    process.exit(0);
  }

  if (toProcess.length === 0) {
    console.log("[backfill-all] nothing to process.");
    process.exit(0);
  }

  let ok = 0;
  let failed = 0;
  const startMs = Date.now();

  for (let i = 0; i < toProcess.length; i++) {
    const { spotifyId } = toProcess[i]!;

    try {
      const albumResp = await getAlbum(spotifyId, { skipCache: true });
      await upsertAlbumFromSpotify(admin, albumResp);
      ok++;
    } catch (e) {
      failed++;
      console.warn("[backfill-all] failed", {
        spotifyId,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    if ((i + 1) % 50 === 0) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(0);
      const rate = (ok / ((Date.now() - startMs) / 1000)).toFixed(1);
      console.log("[backfill-all] progress", {
        done: i + 1,
        total: toProcess.length,
        ok,
        failed,
        elapsedSec: elapsed,
        albumsPerSec: rate,
      });
    }

    if (gapMs > 0 && i < toProcess.length - 1) {
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log("[backfill-all] done", {
    ok,
    failed,
    total: toProcess.length,
    totalSec,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
