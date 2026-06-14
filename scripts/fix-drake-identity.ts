/**
 * One-time fix for the corrupted Drake canonical row (UUID 1c522914-a1fb-4a0c-9b55-70b6a8bef4b2).
 *
 * What went wrong:
 *   - Two extra Spotify IDs got linked to Drake's row: DrakeThaLowk's ID (4ahE4Menrgz9qJX3o1rRyS)
 *     and the UUID itself stored as a Spotify external ID.
 *   - Enrichment resolved the first Spotify ID it found, got DrakeThaLowk's data from Spotify,
 *     and overwrote Drake's name + image.
 *
 * This script:
 *   1. Removes the two bogus external IDs.
 *   2. Restores the artist name to "Drake".
 *   3. Clears image_url + cached_at so the next page load re-fetches from the correct Spotify ID.
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     npx tsx scripts/fix-drake-identity.ts
 *
 * Add --dry-run to preview without writing.
 */

import { createSupabaseAdminClient } from "../lib/supabase-admin";

const DRAKE_UUID        = "1c522914-a1fb-4a0c-9b55-70b6a8bef4b2";
const REAL_SPOTIFY_ID   = "3TVXtAsR1Inumwj472S9r4";   // keep — real Drake
const BOGUS_SPOTIFY_IDS = [
  "4ahE4Menrgz9qJX3o1rRyS",                           // DrakeThaLowk's ID
  "1c522914-a1fb-4a0c-9b55-70b6a8bef4b2",             // UUID stored as Spotify ID (wrong)
];

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const supabase = createSupabaseAdminClient();

  // Show current state
  const { data: before } = await supabase
    .from("artists")
    .select("name, image_url, cached_at")
    .eq("id", DRAKE_UUID)
    .maybeSingle();

  const { data: extsBefore } = await supabase
    .from("artist_external_ids")
    .select("source, external_id")
    .eq("artist_id", DRAKE_UUID);

  console.log("\n=== BEFORE ===");
  console.log("name:     ", (before as { name: string }).name);
  console.log("image_url:", (before as { image_url: string | null }).image_url ?? "(none)");
  console.log("external IDs:");
  for (const e of (extsBefore ?? []) as { source: string; external_id: string }[]) {
    const bogus = BOGUS_SPOTIFY_IDS.includes(e.external_id);
    console.log(`  [${e.source}] ${e.external_id}${bogus ? "  ← REMOVING" : ""}`);
  }

  if (dryRun) {
    console.log("\n(dry-run — no changes written)");
    return;
  }

  // 1. Remove bogus Spotify external IDs
  for (const bogusId of BOGUS_SPOTIFY_IDS) {
    const { error } = await supabase
      .from("artist_external_ids")
      .delete()
      .eq("artist_id", DRAKE_UUID)
      .eq("source", "spotify")
      .eq("external_id", bogusId);
    if (error) {
      console.error(`Failed to delete external_id ${bogusId}:`, error);
    } else {
      console.log(`\nDeleted [spotify] ${bogusId}`);
    }
  }

  // 2. Restore name and clear stale image so next load re-fetches from real Spotify ID
  const { error: updateErr } = await supabase
    .from("artists")
    .update({
      name: "Drake",
      image_url: null,
      cached_at: new Date(0).toISOString(), // epoch = forces stale check on next load
      updated_at: new Date().toISOString(),
    })
    .eq("id", DRAKE_UUID);

  if (updateErr) {
    console.error("Failed to update artists row:", updateErr);
    process.exit(1);
  }
  console.log(`\nRestored name → "Drake", cleared image_url + cached_at`);

  // Verify
  const { data: after } = await supabase
    .from("artists")
    .select("name, image_url, cached_at")
    .eq("id", DRAKE_UUID)
    .maybeSingle();

  const { data: extsAfter } = await supabase
    .from("artist_external_ids")
    .select("source, external_id")
    .eq("artist_id", DRAKE_UUID);

  console.log("\n=== AFTER ===");
  console.log("name:     ", (after as { name: string }).name);
  console.log("image_url:", (after as { image_url: string | null }).image_url ?? "(none)");
  console.log("external IDs:");
  for (const e of (extsAfter ?? []) as { source: string; external_id: string }[]) {
    console.log(`  [${e.source}] ${e.external_id}`);
  }

  console.log(`\n✓ Done. On the next visit to /artist/${REAL_SPOTIFY_ID}, the app will`);
  console.log(`  re-fetch Drake's image from Spotify and cache it.`);
  console.log(`\n  Or force it now:`);
  console.log(`  NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \\`);
  console.log(`    npx tsx scripts/refresh-artist-image.ts`);
}

main().catch((e) => { console.error(e); process.exit(1); });
