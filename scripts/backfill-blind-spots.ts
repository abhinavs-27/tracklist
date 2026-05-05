// Env + server-only stubs loaded via NODE_OPTIONS before this runs.
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { refreshBlindSpots } from "@/lib/profile/taste-blind-spots";

// Suppress the Spotify health-degraded warnings that fire on cold-cache runs.
// The backfill intentionally hammers the cache — every miss is expected.
process.env.SPOTIFY_FAIL_FAST_ON_429 = "1"; // abort fast on rate limit rather than retrying

async function main() {
  const admin = createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("logs")
    .select("user_id")
    .limit(100_000);

  if (error) {
    console.error("Failed to fetch users:", error.message);
    process.exit(1);
  }

  const userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  console.log(`Found ${userIds.length} users with listening history\n`);

  let processed = 0, skipped = 0, errors = 0;

  for (let i = 0; i < userIds.length; i++) {
    const userId = userIds[i]!;
    const prefix = `[${i + 1}/${userIds.length}]`;

    try {
      const result = await Promise.race([
        refreshBlindSpots(userId),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out after 90s")), 90_000),
        ),
      ]);
      if (result.hasData) {
        console.log(`${prefix} ✓  ${result.artists.length} blind spots`);
        processed++;
      } else {
        console.log(`${prefix} –  skipped (no Spotify artist data)`);
        skipped++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Rate limit hit — pause and continue rather than aborting the whole run
      if (msg.includes("rate limit") || msg.includes("429")) {
        console.warn(`${prefix} ⏸  Spotify rate limited — waiting 60s...`);
        await new Promise((r) => setTimeout(r, 60_000));
        i--; // retry this user
      } else {
        console.error(`${prefix} ✗  ${msg}`);
        errors++;
      }
    }
  }

  console.log(`\n${"═".repeat(50)}`);
  console.log(`  Done`);
  console.log(`  Blind spots written : ${processed}`);
  console.log(`  Skipped (no data)   : ${skipped}`);
  console.log(`  Errors              : ${errors}`);
  console.log("═".repeat(50));
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
