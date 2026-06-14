/**
 * Process pending Last.fm full imports locally, without BullMQ/Redis.
 * Calls the worker function directly for each user with lastfm_import_status = 'pending'.
 *
 * Usage:
 *   npm run lastfm:run-local
 *
 * Options:
 *   DRY_RUN=1   — list pending users without processing
 *   USER_ID=... — process a single user by ID
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { backfillLastfmScrobblesSince } from "@/lib/lastfm/backfill-scrobbles-since";

const DRY_RUN = process.env.DRY_RUN === "1";
const ONLY_USER = process.env.USER_ID?.trim() ?? null;
const LOG = "[lastfm-local]";

async function run() {
  const supabase = createSupabaseAdminClient();

  let query = supabase
    .from("users")
    .select("id, username, lastfm_username, lastfm_import_status")
    .not("lastfm_username", "is", null)
    .neq("lastfm_username", "")
    .eq("lastfm_import_status", "pending");

  if (ONLY_USER) query = query.eq("id", ONLY_USER);

  const { data, error } = await query;
  if (error) throw new Error(`DB fetch failed: ${error.message}`);

  const users = (data ?? []) as { id: string; username: string; lastfm_username: string }[];
  console.log(LOG, `found ${users.length} pending user(s)`);

  if (DRY_RUN) {
    for (const u of users) console.log(LOG, `  ${u.username} (${u.id}) — lastfm: ${u.lastfm_username}`);
    return;
  }

  for (const user of users) {
    console.log(LOG, `\nprocessing ${user.username} (lastfm: ${user.lastfm_username})`);

    await supabase.from("users").update({
      lastfm_import_status: "running",
      lastfm_import_progress: { startedAt: new Date().toISOString(), pagesDone: 0, logsAdded: 0 },
    }).eq("id", user.id);

    try {
      const result = await backfillLastfmScrobblesSince(
        supabase,
        user.id,
        user.lastfm_username,
        "1970-01-01T00:00:00.000Z",
        {
          pageDelayMs: 200,
          limit: 200,
          maxPagesPerUser: 99999,
          onProgress: async ({ pagesDone, pagesTotal, logsAdded }) => {
            process.stdout.write(`\r${LOG}   page ${pagesDone}/${pagesTotal ?? "?"} — ${logsAdded} logs`);
            await supabase.from("users").update({
              lastfm_import_progress: { pagesDone, pagesTotal, logsAdded },
            }).eq("id", user.id);
          },
        },
      );

      process.stdout.write("\n");

      if (result.fetchFailed) {
        console.error(LOG, `FAILED: ${result.fetchError}`);
        await supabase.from("users").update({
          lastfm_import_status: "failed",
          lastfm_import_progress: { error: result.fetchError, completedAt: new Date().toISOString() },
        }).eq("id", user.id);
        continue;
      }

      await supabase.from("users").update({
        lastfm_import_status: "done",
        lastfm_import_progress: {
          pagesDone: result.pagesFetched,
          logsAdded: result.imported,
          completedAt: new Date().toISOString(),
        },
      }).eq("id", user.id);

      console.log(LOG, `done — imported=${result.imported} pages=${result.pagesFetched}`);
    } catch (e) {
      process.stdout.write("\n");
      const msg = e instanceof Error ? e.message : String(e);
      console.error(LOG, `exception: ${msg}`);
      await supabase.from("users").update({
        lastfm_import_status: "failed",
        lastfm_import_progress: { error: msg, completedAt: new Date().toISOString() },
      }).eq("id", user.id);
    }
  }

  console.log(LOG, "\nall done");
}

run().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exit(1);
});
