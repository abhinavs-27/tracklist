/**
 * Repair script for Last.fm imports.
 * 1. Merges any duplicate catalog entities (artists/albums/tracks) created by concurrent import pages.
 * 2. Optionally resets a stalled import back to 'pending' so it can be retried.
 *
 * Usage:
 *   npm run lastfm:repair
 *
 * Options:
 *   USER_ID=<uuid>   — also reset that user's import status to 'pending' for retry
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const USER_ID = process.env.USER_ID?.trim() ?? null;
const LOG = "[lastfm-repair]";

async function main() {
  const supabase = createSupabaseAdminClient();
  const t0 = Date.now();

  console.log(LOG, "running merge_catalog_duplicate_entities — this may take a minute...");
  const { data: mergeResult, error: mergeErr } = await supabase.rpc(
    "merge_catalog_duplicate_entities",
  );
  if (mergeErr) {
    console.error(LOG, "merge failed", mergeErr);
  } else {
    console.log(LOG, "merge done", mergeResult);
  }

  if (USER_ID) {
    const { error: resetErr } = await supabase
      .from("users")
      .update({ lastfm_import_status: "pending", lastfm_import_progress: {} })
      .eq("id", USER_ID);
    if (resetErr) console.error(LOG, "status reset failed", resetErr);
    else console.log(LOG, `reset import status to 'pending' for user ${USER_ID}`);
  }

  console.log(LOG, `done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exit(1);
});
