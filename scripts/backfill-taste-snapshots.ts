/**
 * One-time backfill: compute taste snapshots for every user × every historical month.
 *
 * Run:
 *   npm run backfill:taste-snapshots
 *
 * Safe to interrupt and re-run — uses ON CONFLICT DO UPDATE so completed months
 * are refreshed, not duplicated. Pass --skip-existing to skip months that already
 * have a snapshot (faster re-run after an interrupted backfill).
 *
 * Options (env vars):
 *   BACKFILL_USER_ID     — process only this single user (UUID)
 *   BACKFILL_SINCE       — earliest month to process, e.g. "2022-01-01" (default: user's first log)
 *   BACKFILL_SKIP_EXISTING=1 — skip months that already have a snapshot row
 *   BACKFILL_DELAY_MS    — ms to wait between users (default: 200)
 */

// Env vars loaded by load-env-local.cjs via NODE_OPTIONS before any module runs.
// register-server-only-stub.cjs stubs `server-only` so server-side modules work here.
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { snapshotUserMonth, monthStart } from "@/lib/cron/snapshot-taste";

// ── Config ─────────────────────────────────────────────────────────────────────
const ONLY_USER   = process.env.BACKFILL_USER_ID?.trim() ?? null;
const SINCE_MONTH = process.env.BACKFILL_SINCE?.trim() ?? null; // 'YYYY-MM-DD'
const SKIP_EXISTING = process.env.BACKFILL_SKIP_EXISTING === "1";
const DELAY_MS    = Math.max(0, parseInt(process.env.BACKFILL_DELAY_MS ?? "200", 10) || 200);
const CHUNK       = 200; // users per page

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** All calendar months between isoStart (inclusive) and isoEnd (exclusive). */
function monthRange(isoStart: string, isoEnd: string): string[] {
  const months: string[] = [];
  const [sy, sm] = isoStart.split("-").map(Number) as [number, number];
  const [ey, em] = isoEnd.split("-").map(Number) as [number, number];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m < em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

async function getAllUserIds(): Promise<string[]> {
  if (ONLY_USER) return [ONLY_USER];

  const ids: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await createSupabaseAdminClient()
      .from("users")
      .select("id")
      .order("id")
      .range(offset, offset + CHUNK - 1);
    if (error) throw new Error(`users page: ${error.message}`);
    if (!data || data.length === 0) break;
    ids.push(...data.map((r) => r.id as string));
    if (data.length < CHUNK) break;
    offset += CHUNK;
  }
  return ids;
}

async function getExistingMonths(userId: string): Promise<Set<string>> {
  if (!SKIP_EXISTING) return new Set();
  const { data, error } = await createSupabaseAdminClient()
    .from("taste_snapshots")
    .select("snapshot_month")
    .eq("user_id", userId);
  if (error) console.warn(`taste_snapshots query error: ${error.message}`);
  return new Set((data ?? []).map((r) => r.snapshot_month as string));
}

async function getUserFirstLogDate(userId: string): Promise<string | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from("logs")
    .select("listened_at")
    .eq("user_id", userId)
    .order("listened_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`logs query for ${userId}: ${error.message}`);
  return data?.[0]?.listened_at?.slice(0, 10) ?? null;
}

async function processUser(userId: string, globalStats: { ok: number; skipped: number; errors: number }) {
  const firstLog = await getUserFirstLogDate(userId);
  if (!firstLog) return; // no logs at all

  const sinceRaw = SINCE_MONTH ?? firstLog;
  const since = sinceRaw < firstLog ? firstLog : sinceRaw;

  // Stop at the beginning of the current month (it's not complete yet)
  const nowMonth = monthStart(new Date());
  const months = monthRange(since.slice(0, 8) + "01", nowMonth);
  if (months.length === 0) return;

  const existing = await getExistingMonths(userId);

  let userOk = 0, userSkipped = 0, userErrors = 0;

  for (const isoMonth of months) {
    if (SKIP_EXISTING && existing.has(isoMonth)) {
      userSkipped++;
      continue;
    }
    try {
      const result = await snapshotUserMonth(userId, isoMonth);
      if (result) userOk++;
      else userSkipped++; // no logs that month
    } catch (e) {
      userErrors++;
      console.error(`  ✗ ${userId} ${isoMonth}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  globalStats.ok      += userOk;
  globalStats.skipped += userSkipped;
  globalStats.errors  += userErrors;
  console.log(`  ${userId.slice(0, 8)}… ✓${userOk} –${userSkipped} ✗${userErrors}`);
}

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  Taste snapshot backfill");
  console.log(`  skip_existing=${SKIP_EXISTING}  delay=${DELAY_MS}ms`);
  if (ONLY_USER) console.log(`  user=${ONLY_USER}`);
  if (SINCE_MONTH) console.log(`  since=${SINCE_MONTH}`);
  console.log("═══════════════════════════════════════════════════\n");

  const userIds = await getAllUserIds();
  console.log(`Found ${userIds.length} users\n`);

  const stats = { ok: 0, skipped: 0, errors: 0 };
  let i = 0;

  for (const userId of userIds) {
    i++;
    process.stdout.write(`[${i}/${userIds.length}] `);
    await processUser(userId, stats);
    if (DELAY_MS > 0 && i < userIds.length) await sleep(DELAY_MS);
  }

  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Done");
  console.log(`  Snapshots written : ${stats.ok}`);
  console.log(`  Skipped (no data) : ${stats.skipped}`);
  console.log(`  Errors            : ${stats.errors}`);
  console.log("═══════════════════════════════════════════════════");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
