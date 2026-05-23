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

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enrichArtist } from "@/lib/musicbrainz/enrich-artist";
import { enrichAlbum } from "@/lib/musicbrainz/enrich-album";
import { enrichSong } from "@/lib/musicbrainz/enrich-song";

const TOP_N = parseInt(process.env.BACKFILL_TOP_N ?? "100", 10);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
  for (const a of artists ?? []) {
    console.log(`  → artist: ${a.name} (${a.id})`);
    try {
      await enrichArtist(a.id as string);
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message}`);
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
  for (const a of albums ?? []) {
    console.log(`  → album: ${a.name} (${a.id})`);
    try {
      await enrichAlbum(a.id as string);
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message}`);
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
  for (const t of tracks ?? []) {
    console.log(`  → track: ${t.name} (${t.id})`);
    try {
      await enrichSong(t.id as string);
    } catch (e) {
      console.error(`  ✗ ${(e as Error).message}`);
    }
    await sleep(1100);
  }

  console.log("[backfill] Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
