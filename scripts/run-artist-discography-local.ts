/**
 * Run the Deezer-first artist discography sync LOCALLY, in-process — no SQS.
 *
 * Pages through every artist with discography_synced_at IS NULL and calls
 * syncArtistDiscography() directly. Deezer + MusicBrainz rate limits are enforced
 * by the module-level Bottleneck limiters inside the sync (Deezer: 6 concurrent /
 * 50ms; MusicBrainz fallback: 1 / 1.1s), so this won't overwhelm either source
 * regardless of CONCURRENCY.
 *
 * ── Fully resumable ──────────────────────────────────────────────────────────
 * Three layers, so you can stop/restart freely AND the job always converges:
 *
 *  1. DB is the checkpoint. syncArtistDiscography stamps discography_synced_at on
 *     success (and on genuine no-match, to avoid re-probing empty artists), so a
 *     completed artist drops out of the IS NULL set. Re-running resumes exactly
 *     where the DB left off — no cursor file needed.
 *
 *  2. Failure ledger (STATE_FILE, default .disco-sync-state.json). An artist that
 *     ERRORS or TIMES OUT is never stamped, so plain DB resume would retry it
 *     forever. The ledger records attempts+lastError per failed artist and
 *     QUARANTINES it after MAX_ATTEMPTS, so persistently-broken artists stop
 *     blocking convergence. Re-run with RETRY_FAILED=1 to give quarantined
 *     artists another chance. A later success clears the artist from the ledger.
 *
 *  3. Graceful shutdown. SIGINT/SIGTERM stops handing out new artists, lets
 *     in-flight ones finish, flushes the ledger, and prints resume instructions.
 *     A second Ctrl-C force-exits (in-flight artists are simply retried next run).
 *
 * Usage (from repo root, with .env loaded):
 *   npm run backfill:artist-discography:local
 *
 * Or manually:
 *   NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' \
 *     npx tsx scripts/run-artist-discography-local.ts
 *
 * Options (env vars):
 *   DRY_RUN=1            List artists that would be synced; don't call the sync.
 *   MAX_ARTISTS=5         Stop after N artists (0 = unlimited). Use for a smoke test.
 *   BATCH_SIZE=200        Artists per DB page (default 200).
 *   CONCURRENCY=8         Parallel syncs (default 8). Supabase load caps real throughput.
 *   ARTIST_TIMEOUT_MS     Per-artist hang backstop (default 600000 = 10min).
 *   MAX_ATTEMPTS=3        Quarantine an artist after this many failed attempts.
 *   RETRY_FAILED=1        Ignore quarantine — re-attempt previously-quarantined artists.
 *   STATE_FILE=path       Failure-ledger location (default ./.disco-sync-state.json).
 */

import fs from "node:fs";
import path from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { syncArtistDiscography } from "@/lib/deezer/sync-discography";

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ARTISTS = parseInt(process.env.MAX_ARTISTS ?? "0", 10);
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE ?? "200", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "8", 10);
// True-hang backstop only. syncArtistDiscography fetches each album's tracks
// SEQUENTIALLY, so a huge-discography artist (e.g. Fally Ipupa, Palak Muchhal —
// hundreds of albums) legitimately takes minutes. The timeout must be generous
// enough not to starve those, and only exists to unstick a genuinely dead socket
// (a Supabase call with no timeout can hang forever). The rolling worker pool
// below means a slow artist occupies only ONE worker, never blocking the others.
const ARTIST_TIMEOUT_MS = parseInt(process.env.ARTIST_TIMEOUT_MS ?? "600000", 10);
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS ?? "3", 10);
const RETRY_FAILED = process.env.RETRY_FAILED === "1";
const STATE_FILE =
  process.env.STATE_FILE ?? path.join(process.cwd(), ".disco-sync-state.json");

class ArtistTimeoutError extends Error {}

function withTimeout(promise: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ArtistTimeoutError(`timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${String(m).padStart(2, "0")}m`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as { message?: string; details?: string };
    return o.message || o.details || JSON.stringify(e);
  }
  return String(e);
}

// Transient = network/DNS/connection blip (Supabase or Deezer). These must NOT
// kill the run (retry the DB op) and must NOT count toward an artist's quarantine
// budget (a wifi hiccup shouldn't quarantine a healthy artist). A real per-artist
// TIMEOUT is deliberately NOT transient — a persistently-slow artist should still
// quarantine after MAX_ATTEMPTS so it stops wasting the timeout budget.
function isTransient(e: unknown): boolean {
  const s = `${errMsg(e)} ${((e as { details?: string })?.details ?? "")}`.toLowerCase();
  return /fetch failed|enotfound|eai_again|econnreset|econnrefused|etimedout|epipe|socket hang up|getaddrinfo|network|502|503|504/.test(
    s,
  );
}

type QueryResult<T> = { data: T; error: unknown };

// Retry a Supabase query through transient network errors with exponential
// backoff (capped). supabase-js returns fetch failures as `result.error` rather
// than throwing, so we inspect both the thrown path and the returned error.
async function withDbRetry<T>(
  run: () => PromiseLike<QueryResult<T>>,
  label: string,
  maxAttempts = 10,
): Promise<QueryResult<T>> {
  let attempt = 0;
  for (;;) {
    attempt++;
    let res: QueryResult<T>;
    try {
      res = await run();
    } catch (e) {
      res = { data: null as T, error: e };
    }
    if (!res.error) return res;
    if (!isTransient(res.error) || attempt >= maxAttempts) return res;
    const backoff = Math.min(20000, 1000 * 2 ** (attempt - 1));
    console.error(
      `\n[disco-local] DB ${label}: transient error (attempt ${attempt}/${maxAttempts}), retry in ${backoff}ms — ${errMsg(res.error)}`,
    );
    await sleep(backoff);
  }
}

// ── Failure ledger ────────────────────────────────────────────────────────────
type FailureRecord = { name: string; attempts: number; lastError: string; lastAt: string };
type StateFile = { version: 1; failures: Record<string, FailureRecord> };

function loadState(): StateFile {
  try {
    const raw = fs.readFileSync(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as StateFile;
    if (parsed && parsed.failures) return { version: 1, failures: parsed.failures };
  } catch {
    // Missing or corrupt ledger → start clean. Never let a bad ledger abort the run.
  }
  return { version: 1, failures: {} };
}

function writeStateSync(state: StateFile): void {
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_FILE); // atomic replace — never leaves a half-written ledger
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const state = loadState();

  const quarantined = new Set(
    Object.entries(state.failures)
      .filter(([, f]) => f.attempts >= MAX_ATTEMPTS)
      .map(([id]) => id),
  );

  console.log(
    `[disco-local] Starting${DRY_RUN ? " (DRY RUN)" : ""} — batch=${BATCH_SIZE} concurrency=${CONCURRENCY}` +
      `${MAX_ARTISTS ? ` max=${MAX_ARTISTS}` : ""} maxAttempts=${MAX_ATTEMPTS}${RETRY_FAILED ? " RETRY_FAILED" : ""}`,
  );
  console.log(
    `[disco-local] ledger: ${Object.keys(state.failures).length} known failures, ` +
      `${quarantined.size} quarantined${RETRY_FAILED ? " (ignored this run)" : " (skipped)"} — ${STATE_FILE}`,
  );

  const countRes = await withDbRetry(
    () =>
      supabase
        .from("artists")
        .select("id", { count: "exact", head: true })
        .is("discography_synced_at", null),
    "count",
  );
  // count is cosmetic (progress %) — tolerate a final failure rather than abort.
  const count = (countRes as { count?: number | null }).count ?? null;

  console.log(`[disco-local] ${count ?? "?"} artists unsynced`);

  const startedAt = Date.now();
  type Artist = { id: string; name: string };

  // Debounced, atomic ledger persistence: flush at most every 2s when dirty.
  let dirty = false;
  const flushTimer = setInterval(() => {
    if (dirty) {
      dirty = false;
      try {
        writeStateSync(state);
      } catch (e) {
        console.error("[disco-local] ledger flush failed:", e);
      }
    }
  }, 2000);
  flushTimer.unref?.();

  function recordFailure(a: Artist, reason: string, transient: boolean) {
    const prev = state.failures[a.id];
    state.failures[a.id] = {
      name: a.name,
      // Transient network blips don't count toward quarantine — only real failures do.
      attempts: (prev?.attempts ?? 0) + (transient ? 0 : 1),
      lastError: reason,
      lastAt: new Date().toISOString(),
    };
    dirty = true;
  }
  function recordSuccess(a: Artist) {
    if (state.failures[a.id]) {
      delete state.failures[a.id];
      dirty = true;
    }
  }

  // ── Continuous producer ─────────────────────────────────────────────────────
  // Keyset-paginate the unsynced set into a buffer that the worker pool drains.
  // Stable across the stamps we write as we go: we only ever fetch id > lastId,
  // and lastId advances monotonically, so no artist is fetched twice or skipped.
  // Quarantined artists are filtered out here so they never reach a worker.
  let lastId = "";
  let exhausted = false;
  let handedOut = 0;
  let skippedQuarantined = 0;
  let shuttingDown = false;
  const buffer: Artist[] = [];
  let refilling: Promise<void> | null = null;

  async function refill(): Promise<void> {
    if (exhausted) return;
    const { data, error } = await withDbRetry<Artist[]>(() => {
      let q = supabase
        .from("artists")
        .select("id, name")
        .is("discography_synced_at", null)
        .order("id", { ascending: true })
        .limit(BATCH_SIZE);
      if (lastId) q = q.gt("id", lastId);
      return q as unknown as PromiseLike<QueryResult<Artist[]>>;
    }, "refill");
    if (error) {
      // Survived retries and still failing → network is genuinely down (e.g. long
      // sleep). Stop gracefully rather than crash; the DB checkpoint means a
      // re-run resumes exactly here with zero lost work.
      console.error(
        `\n[disco-local] refill failed after retries — stopping gracefully (re-run to resume): ${errMsg(error)}`,
      );
      exhausted = true;
      shuttingDown = true;
      return;
    }
    if (!data?.length) {
      exhausted = true;
      return;
    }
    const rows = data;
    lastId = rows[rows.length - 1].id; // advance BEFORE filtering, so we never re-fetch
    for (const a of rows) {
      if (!RETRY_FAILED && quarantined.has(a.id)) {
        skippedQuarantined++;
        continue;
      }
      buffer.push(a);
    }
  }

  async function nextArtist(): Promise<Artist | null> {
    if (shuttingDown) return null;
    if (MAX_ARTISTS && handedOut >= MAX_ARTISTS) return null;
    while (buffer.length === 0 && !exhausted) {
      if (!refilling) refilling = refill().finally(() => (refilling = null));
      await refilling;
      if (shuttingDown) return null;
    }
    const a = buffer.shift() ?? null;
    if (a) handedOut++;
    return a;
  }

  let processed = 0;
  let succeeded = 0;
  let errors = 0;
  let inFlight = 0;

  function printProgress() {
    const elapsed = Date.now() - startedAt;
    const rate = processed / (elapsed / 1000); // artists/sec
    const remaining = count ? Math.max(0, count - processed) : null;
    const eta = rate > 0 && remaining != null ? fmtDuration((remaining / rate) * 1000) : "?";
    const pct = count ? Math.round((processed / count) * 100) : "?";
    process.stdout.write(
      `\r[disco-local] ${processed}/${count ?? "?"} (${pct}%) ok=${succeeded} err=${errors} inflight=${inFlight} ${rate.toFixed(2)}/s ETA ${eta}   `,
    );
  }

  if (DRY_RUN) {
    for (let a = await nextArtist(); a; a = await nextArtist()) {
      console.log(`  [dry] ${a.id}  ${a.name}`);
      processed++;
    }
    clearInterval(flushTimer);
    console.log(
      `\n[disco-local] DRY RUN — ${processed} artists would be synced, ${skippedQuarantined} quarantined skipped.`,
    );
    process.exit(0); // Supabase keep-alive sockets keep the loop alive; exit explicitly.
  }

  // ── Graceful shutdown ────────────────────────────────────────────────────────
  function onSignal(sig: string) {
    if (shuttingDown) {
      console.log(`\n[disco-local] ${sig} again — force exit. Re-run to resume.`);
      try {
        writeStateSync(state);
      } catch {
        /* best effort */
      }
      process.exit(130);
    }
    shuttingDown = true;
    console.log(
      `\n[disco-local] ${sig} — draining ${inFlight} in-flight artist(s); Ctrl-C again to force. Progress is saved.`,
    );
  }
  process.on("SIGINT", () => onSignal("SIGINT"));
  process.on("SIGTERM", () => onSignal("SIGTERM"));

  // ── Rolling worker pool ──────────────────────────────────────────────────────
  // Each worker pulls the next artist and processes it independently. A slow
  // (huge-discography) artist occupies exactly one worker; the others keep going.
  async function worker() {
    for (let a = await nextArtist(); a; a = await nextArtist()) {
      inFlight++;
      try {
        await withTimeout(syncArtistDiscography(a.id), ARTIST_TIMEOUT_MS);
        succeeded++;
        recordSuccess(a);
      } catch (err) {
        errors++;
        // A TIMEOUT is never "transient" — a persistently-slow artist should
        // still accrue attempts and quarantine. Network blips do not.
        const transient = !(err instanceof ArtistTimeoutError) && isTransient(err);
        const reason =
          err instanceof ArtistTimeoutError ? `TIMEOUT after ${ARTIST_TIMEOUT_MS}ms` : errMsg(err);
        recordFailure(a, reason, transient);
        const attempts = state.failures[a.id].attempts;
        const quarantine = attempts >= MAX_ATTEMPTS ? " — QUARANTINED" : "";
        const tag = transient ? " [transient]" : "";
        console.error(
          `  [error] ${a.id} ${a.name} (attempt ${attempts}/${MAX_ATTEMPTS})${tag}${quarantine}: ${reason}`,
        );
      } finally {
        inFlight--;
        processed++;
        printProgress();
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  clearInterval(flushTimer);
  writeStateSync(state); // final durable flush

  const nowQuarantined = Object.values(state.failures).filter((f) => f.attempts >= MAX_ATTEMPTS).length;
  const remainingFailures = Object.keys(state.failures).length;
  console.log(
    `\n[disco-local] ${shuttingDown ? "Stopped" : "Done"} in ${fmtDuration(Date.now() - startedAt)}. ` +
      `synced=${succeeded} failed=${errors} quarantinedSkipped=${skippedQuarantined}`,
  );
  console.log(
    `[disco-local] ledger now: ${remainingFailures} failures pending, ${nowQuarantined} quarantined.`,
  );
  if (nowQuarantined > 0) {
    console.log(
      `[disco-local] Re-run to retry the ${remainingFailures - nowQuarantined} non-quarantined failures; ` +
        `add RETRY_FAILED=1 to also re-attempt the ${nowQuarantined} quarantined.`,
    );
  }

  process.exit(0); // Supabase keep-alive sockets keep the loop alive; exit explicitly.
}

main().catch((e) => {
  console.error("[disco-local] Fatal:", e);
  process.exit(1);
});
