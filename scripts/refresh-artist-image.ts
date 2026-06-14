/**
 * Check and force-refresh a single artist's image_url from Spotify.
 *
 * Usage:
 *   NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     tsx scripts/refresh-artist-image.ts -- --spotify-id 3TVXtAsR1Inumwj472S9r4
 */

import { createSupabaseAdminClient } from "../lib/supabase-admin";
import { getArtist } from "../lib/spotify";
import { upsertArtistFromSpotify } from "../lib/spotify-cache";

const args = process.argv.slice(2);
const spotifyIdFlag = args.indexOf("--spotify-id");
const spotifyId = spotifyIdFlag !== -1 ? args[spotifyIdFlag + 1] : "3TVXtAsR1Inumwj472S9r4";

async function main() {
  const supabase = createSupabaseAdminClient();

  // 1. Find canonical UUID via external ID mapping
  const { data: extRow } = await supabase
    .from("artist_external_ids")
    .select("artist_id")
    .eq("source", "spotify")
    .eq("external_id", spotifyId)
    .maybeSingle();

  if (!extRow) {
    console.error(`No artist found with Spotify ID ${spotifyId}`);
    process.exit(1);
  }

  const canonicalId = (extRow as { artist_id: string }).artist_id;

  // 2. Print current DB state
  const { data: before } = await supabase
    .from("artists")
    .select("name, image_url, cached_at, updated_at")
    .eq("id", canonicalId)
    .maybeSingle();

  console.log("\n--- BEFORE ---");
  console.log("name:       ", (before as { name: string }).name);
  console.log("image_url:  ", (before as { image_url: string | null }).image_url);
  console.log("cached_at:  ", (before as { cached_at: string | null }).cached_at);
  console.log("updated_at: ", (before as { updated_at: string }).updated_at);

  const cachedAt = (before as { cached_at: string | null }).cached_at ?? (before as { updated_at: string }).updated_at;
  const ageMs = Date.now() - new Date(cachedAt).getTime();
  const ageDays = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);
  console.log(`cache age:   ${ageDays} days (TTL is 30 days)`);

  // 3. Fetch fresh data from Spotify
  console.log("\nFetching fresh data from Spotify...");
  const artist = await getArtist(spotifyId);
  console.log("Spotify images returned:", artist.images?.map(i => `${i.url?.slice(0, 60)}... (${i.width}x${i.height})`));

  // 4. Upsert into DB
  await upsertArtistFromSpotify(supabase, artist);

  // 5. Print new DB state
  const { data: after } = await supabase
    .from("artists")
    .select("name, image_url, cached_at")
    .eq("id", canonicalId)
    .maybeSingle();

  console.log("\n--- AFTER ---");
  console.log("image_url:  ", (after as { image_url: string | null }).image_url);
  console.log("cached_at:  ", (after as { cached_at: string | null }).cached_at);

  const changed = (before as { image_url: string | null }).image_url !== (after as { image_url: string | null }).image_url;
  console.log(changed ? "\n✓ image_url was updated" : "\n~ image_url unchanged (was already current)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
