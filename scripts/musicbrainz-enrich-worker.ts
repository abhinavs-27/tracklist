/**
 * Long-running BullMQ worker for the `musicbrainz-enrich` queue.
 *
 * Requires `REDIS_URL` and the same env as production for Supabase + MusicBrainz
 * (see `processMusicBrainzEnrichJob` in lib/jobs/musicbrainzQueue.ts).
 *
 *   npm run worker:musicbrainz-enrich
 *
 * Uses `scripts/register-server-only-stub.cjs` via NODE_OPTIONS so job modules load
 * outside the Next.js bundler.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createMusicBrainzWorker } from "../lib/jobs/musicbrainzQueue";

function loadEnvFile() {
  const p = path.join(process.cwd(), ".env");
  try {
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq <= 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* no .env */
  }
}

function main() {
  loadEnvFile();
  if (!process.env.REDIS_URL?.trim()) {
    console.error(
      "[musicbrainz-enrich-worker] REDIS_URL is not set. Add it to .env or the environment.",
    );
    process.exit(1);
  }

  const worker = createMusicBrainzWorker();
  if (!worker) {
    console.error(
      "[musicbrainz-enrich-worker] Could not connect to Redis (check REDIS_URL).",
    );
    process.exit(1);
  }

  console.log("[musicbrainz-enrich-worker] started (queue: musicbrainz-enrich)");

  worker.on("error", (err) => {
    console.error("[musicbrainz-enrich-worker] error", err);
  });
  worker.on("completed", (job) => {
    console.log("[musicbrainz-enrich-worker] completed", job.id, job.name);
  });
  worker.on("failed", (job, err) => {
    console.error("[musicbrainz-enrich-worker] failed", job?.id, job?.name, err);
  });

  const shutdown = async () => {
    console.log("[musicbrainz-enrich-worker] shutting down…");
    await worker.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main();
