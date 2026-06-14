/**
 * Enqueue full Last.fm history import jobs for all existing users who have a
 * lastfm_username but have never had a full import triggered
 * (lastfm_import_status IS NULL).
 *
 * Requires REDIS_URL to be set (BullMQ).
 *
 * Usage:
 *   npm run backfill:lastfm-full-import
 *
 * Options (env vars):
 *   DRY_RUN=1   — print eligible users without enqueuing
 *   BATCH=50    — users per DB page (default 500)
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enqueueLastfmFullImport } from "@/lib/jobs/lastfmQueue";

const DRY_RUN = process.env.DRY_RUN === "1";
const PAGE_SIZE = parseInt(process.env.BATCH ?? "500", 10);
const LOG = "[backfill-lastfm-full-import]";

async function fetchEligibleUsers(
  offset: number,
): Promise<{ id: string; lastfm_username: string }[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, lastfm_username")
    .not("lastfm_username", "is", null)
    .neq("lastfm_username", "")
    .is("lastfm_import_status", null)
    .order("id")
    .range(offset, offset + PAGE_SIZE - 1);

  if (error) throw new Error(`DB fetch failed: ${error.message}`);

  return (data ?? []).filter(
    (u): u is { id: string; lastfm_username: string } =>
      typeof u.id === "string" && Boolean(u.lastfm_username?.trim()),
  );
}

async function main() {
  if (DRY_RUN) {
    console.log(LOG, "DRY RUN — will not enqueue or update DB");
  }

  let offset = 0;
  let totalEnqueued = 0;
  let totalSkipped = 0;

  for (;;) {
    const users = await fetchEligibleUsers(offset);
    if (users.length === 0) break;

    console.log(LOG, `page offset=${offset} found=${users.length}`);

    for (const user of users) {
      if (DRY_RUN) {
        console.log(LOG, `  would enqueue user=${user.id} lastfm=${user.lastfm_username}`);
        totalEnqueued++;
        continue;
      }

      try {
        // Mark pending in DB first so the UI can show progress immediately
        const supabase = createSupabaseAdminClient();
        await supabase
          .from("users")
          .update({ lastfm_import_status: "pending", lastfm_import_progress: {} })
          .eq("id", user.id);

        await enqueueLastfmFullImport({
          userId: user.id,
          lastfmUsername: user.lastfm_username.trim(),
          fromIso: "1970-01-01T00:00:00.000Z",
        });

        console.log(LOG, `  enqueued user=${user.id} lastfm=${user.lastfm_username}`);
        totalEnqueued++;
      } catch (e) {
        console.warn(LOG, `  FAILED user=${user.id}`, e instanceof Error ? e.message : String(e));
        totalSkipped++;
      }
    }

    offset += users.length;
    if (users.length < PAGE_SIZE) break;
  }

  console.log(LOG, `done — enqueued=${totalEnqueued} skipped=${totalSkipped}`);
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exit(1);
});
