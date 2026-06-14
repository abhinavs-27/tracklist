/**
 * Diagnose duplicate / mislinked artist records.
 *
 * Usage (diagnose):
 *   NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     tsx scripts/diagnose-artist-identity.ts -- --name "drake"
 *
 * Usage (fix — re-point a Spotify ID to a different canonical UUID):
 *   ... tsx scripts/diagnose-artist-identity.ts -- --name "drake" \
 *       --fix-spotify-id 3TVXtAsR1Inumwj472S9r4 --correct-uuid <correct-uuid>
 */

import { createSupabaseAdminClient } from "../lib/supabase-admin";

const args = process.argv.slice(2);
function flag(name: string) {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
}

const artistName = flag("--name") ?? "drake";
const fixSpotifyId = flag("--fix-spotify-id");
const correctUuid = flag("--correct-uuid");

async function main() {
  const supabase = createSupabaseAdminClient();
  const nn = artistName.trim().toLowerCase();

  // 1. Find all artist rows matching this name (try generated column first, fall back to ilike)
  let rows: { id: string; name: string; image_url: string | null; cached_at: string | null; updated_at: string; data_source: string | null }[] | null = null;
  const { data: byNorm, error: normErr } = await supabase
    .from("artists")
    .select("id, name, image_url, cached_at, updated_at, data_source")
    .eq("name_normalized", nn);

  if (!normErr && byNorm?.length) {
    rows = byNorm as unknown as typeof rows;
  } else {
    // Fall back to case-insensitive name match
    const { data: byIlike, error: ilikeErr } = await supabase
      .from("artists")
      .select("id, name, image_url, cached_at, updated_at, data_source")
      .ilike("name", `%${artistName.trim()}%`);
    if (ilikeErr) { console.error("artists select failed:", ilikeErr); process.exit(1); }
    rows = byIlike as typeof rows;
  }

  if (!rows?.length) { console.log(`No artists found matching "${artistName}"`); process.exit(0); }

  console.log(`\nFound ${rows.length} artist row(s) for "${artistName}":\n`);

  for (const row of rows as { id: string; name: string; image_url: string | null; cached_at: string | null; updated_at: string; data_source: string | null }[]) {
    console.log(`  UUID:        ${row.id}`);
    console.log(`  name:        ${row.name}`);
    console.log(`  data_source: ${row.data_source ?? "(null)"}`);
    console.log(`  image_url:   ${row.image_url ?? "(none)"}`);
    console.log(`  cached_at:   ${row.cached_at ?? "(null)"}`);

    // External IDs for this row
    const { data: extIds } = await supabase
      .from("artist_external_ids")
      .select("source, external_id")
      .eq("artist_id", row.id);

    if (extIds?.length) {
      for (const e of extIds as { source: string; external_id: string }[]) {
        console.log(`  external_id: [${e.source}] ${e.external_id}`);
      }
    } else {
      console.log(`  external_id: (none)`);
    }
    console.log();
  }

  // 2. Show which UUID the real Spotify Drake ID currently resolves to
  const drakeSpotifyId = fixSpotifyId ?? "3TVXtAsR1Inumwj472S9r4";
  const { data: mapping } = await supabase
    .from("artist_external_ids")
    .select("artist_id")
    .eq("source", "spotify")
    .eq("external_id", drakeSpotifyId)
    .maybeSingle();

  const currentUuid = (mapping as { artist_id?: string } | null)?.artist_id ?? null;
  console.log(`Spotify ID ${drakeSpotifyId} → currently maps to: ${currentUuid ?? "(unmapped)"}\n`);

  // 3. Optionally re-point the Spotify ID to the correct UUID
  if (fixSpotifyId && correctUuid) {
    if (currentUuid === correctUuid) {
      console.log("Already mapped to the correct UUID — no change needed.");
      return;
    }

    console.log(`Remapping [spotify] ${fixSpotifyId}`);
    console.log(`  from: ${currentUuid ?? "(none)"}`);
    console.log(`  to:   ${correctUuid}`);

    if (currentUuid) {
      // Delete the wrong mapping
      const { error: delErr } = await supabase
        .from("artist_external_ids")
        .delete()
        .eq("source", "spotify")
        .eq("external_id", fixSpotifyId)
        .eq("artist_id", currentUuid);
      if (delErr) { console.error("Delete failed:", delErr); process.exit(1); }
    }

    // Insert correct mapping
    const { error: insErr } = await supabase
      .from("artist_external_ids")
      .upsert({ artist_id: correctUuid, source: "spotify", external_id: fixSpotifyId });
    if (insErr) { console.error("Insert failed:", insErr); process.exit(1); }

    console.log("Done. Re-run without --fix flags to verify.");
  } else if (fixSpotifyId || correctUuid) {
    console.log("Provide both --fix-spotify-id and --correct-uuid to apply a fix.");
  } else {
    console.log("To fix: re-run with --fix-spotify-id <spotify-id> --correct-uuid <correct-uuid>");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
