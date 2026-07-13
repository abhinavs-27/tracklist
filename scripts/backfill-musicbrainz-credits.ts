/**
 * One-time backfill: enrich top N entities by listen count with MusicBrainz credits.
 *
 * Enriches artists, albums, and tracks that have no credits yet.
 * Respects rate limits (1 req/sec per entity type). Uses the admin client.
 *
 * Usage (from repo root, with .env loaded):
 *
 *   NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' npx tsx scripts/backfill-musicbrainz-credits.ts
 *
 * Or via npm script:
 *
 *   npm run backfill:musicbrainz-credits
 *
 * Environment variables:
 *   BACKFILL_TOP_N   Number of entities per type to enrich (default 100).
 */

// Node.js 20 lacks native WebSocket; polyfill with undici (already a dep) for Supabase Realtime.
import { WebSocket } from "undici";
if (!("WebSocket" in globalThis)) Object.assign(globalThis, { WebSocket });

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enrichArtist } from "@/lib/musicbrainz/enrich-artist";
import { enrichAlbum } from "@/lib/musicbrainz/enrich-album";
import { enrichSong } from "@/lib/musicbrainz/enrich-song";

const TOP_N = parseInt(process.env.BACKFILL_TOP_N ?? "100", 10);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s: ${label}`)), ms)
    ),
  ]);
}

async function main() {
  const supabase = createSupabaseAdminClient();
  console.log(
    `[backfill] Starting MusicBrainz credits backfill — top ${TOP_N} of each entity type`
  );

  // Artists with no credits yet
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name, credits_enriched_at")
    .is("credits_enriched_at", null)
    .limit(TOP_N);

  console.log(`[backfill] Enriching ${artists?.length ?? 0} artists…`);
  for (const [i, a] of (artists ?? []).entries()) {
    console.log(`  [${i + 1}/${artists!.length}] artist: ${a.name}`);
    try {
      await withTimeout(enrichArtist(a.id as string), 90_000, `artist ${a.name}`);
      console.log(`    ✓ done`);
    } catch (e) {
      console.error(`    ✗ ${(e as Error).message}`);
    }
    await sleep(1100);
  }

  // Albums with no credits yet
  const { data: albums } = await supabase
    .from("albums")
    .select("id, name, credits_enriched_at")
    .is("credits_enriched_at", null)
    .limit(TOP_N);

  console.log(`[backfill] Enriching ${albums?.length ?? 0} albums…`);
  for (const [i, a] of (albums ?? []).entries()) {
    console.log(`  [${i + 1}/${albums!.length}] album: ${a.name}`);
    try {
      await withTimeout(enrichAlbum(a.id as string), 90_000, `album ${a.name}`);
      console.log(`    ✓ done`);
    } catch (e) {
      console.error(`    ✗ ${(e as Error).message}`);
    }
    await sleep(1100);
  }

  // Tracks with no credits yet
  const { data: tracks } = await supabase
    .from("tracks")
    .select("id, name, credits_enriched_at")
    .is("credits_enriched_at", null)
    .limit(TOP_N);

  console.log(`[backfill] Enriching ${tracks?.length ?? 0} tracks…`);
  for (const [i, t] of (tracks ?? []).entries()) {
    console.log(`  [${i + 1}/${tracks!.length}] track: ${t.name}`);
    try {
      await withTimeout(enrichSong(t.id as string), 90_000, `track ${t.name}`);
      console.log(`    ✓ done`);
    } catch (e) {
      console.error(`    ✗ ${(e as Error).message}`);
    }
    await sleep(1100);
  }

  console.log("[backfill] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
