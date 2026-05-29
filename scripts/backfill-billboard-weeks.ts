/**
 * Backfill billboard charts for one or more missed weeks.
 * Runs handlers directly — no SQS needed, safe to re-run (idempotent).
 *
 * Usage:
 *   npm run backfill:billboard-weeks
 *
 * Defaults to the two weeks missed in May 2026 (2026-05-03 and 2026-05-17).
 * Override via env:
 *   BACKFILL_WEEKS="2026-05-03,2026-05-17"   comma-separated week-start dates (YYYY-MM-DD)
 *   BACKFILL_CONCURRENCY=5                    parallel jobs per wave (default: 5)
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getUserIdsWithLogsInRange,
  getCommunityIdsWithLogsInRange,
} from "@/lib/charts/billboard-week-participants";
import {
  runGenerateUserBillboard,
  runGenerateCommunityBillboard,
} from "@/lib/jobs/billboard-handlers";

const RAW_WEEKS = process.env.BACKFILL_WEEKS ?? "2026-05-03,2026-05-17";
const CONCURRENCY = Math.max(1, parseInt(process.env.BACKFILL_CONCURRENCY ?? "5", 10) || 5);

const WEEK_STARTS = RAW_WEEKS.split(",").map((s) => s.trim()).filter(Boolean);

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function processWeek(weekStart: string) {
  const weekStartDate = new Date(`${weekStart}T00:00:00.000Z`);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
  const weekEndExclusive = weekEndDate.toISOString();
  const weekIso = weekStartDate.toISOString();

  console.log(`\n=== Week ${weekStart} → ${weekEndDate.toISOString().slice(0, 10)} ===`);

  const [userIds, communityIds] = await Promise.all([
    getUserIdsWithLogsInRange(weekIso, weekEndExclusive),
    getCommunityIdsWithLogsInRange(weekIso, weekEndExclusive),
  ]);

  console.log(`  ${userIds.length} users, ${communityIds.length} communities`);

  if (userIds.length === 0 && communityIds.length === 0) {
    console.log("  No participants — skipping.");
    return;
  }

  // Users
  let usersDone = 0;
  await withConcurrency(userIds, CONCURRENCY, async (userId) => {
    try {
      await runGenerateUserBillboard({ userId, week: weekIso });
    } catch (e) {
      console.error(`  user ${userId} failed:`, e instanceof Error ? e.message : String(e));
    }
    usersDone++;
    if (usersDone % 10 === 0 || usersDone === userIds.length) {
      process.stdout.write(`\r  users: ${usersDone}/${userIds.length}`);
    }
  });
  if (userIds.length > 0) console.log();

  // Communities
  let commDone = 0;
  await withConcurrency(communityIds, CONCURRENCY, async (communityId) => {
    try {
      await runGenerateCommunityBillboard({ communityId, week: weekIso });
    } catch (e) {
      console.error(`  community ${communityId} failed:`, e instanceof Error ? e.message : String(e));
    }
    commDone++;
  });

  console.log(`  done — ${usersDone} users, ${commDone} communities`);
}

async function main() {
  console.log(`Backfilling ${WEEK_STARTS.length} week(s): ${WEEK_STARTS.join(", ")}`);
  console.log(`Concurrency: ${CONCURRENCY}`);

  for (const weekStart of WEEK_STARTS) {
    await processWeek(weekStart);
    await sleep(250);
  }

  console.log("\nAll weeks done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
