/**
 * Long-running BullMQ worker for the `spotify-enrich` queue.
 *
 * Requires `REDIS_URL` and the same env as production for Supabase + Spotify
 * (see `processSpotifyEnrichJob` in lib/jobs/spotifyQueue.ts).
 *
 *   npm run worker:spotify-enrich
 *
 * Uses `scripts/register-server-only-stub.cjs` via NODE_OPTIONS so job modules load
 * outside the Next.js bundler.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { createSpotifyEnrichWorker } from "../lib/jobs/spotifyQueue";
import { createLastfmImportWorker } from "../lib/jobs/lastfmQueue";
import { processLastfmFullImportJob } from "../lib/jobs/lastfm-full-import-worker";

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
    console.error("[worker] REDIS_URL is not set. Add it to .env or the environment.");
    process.exit(1);
  }

  const spotifyWorker = createSpotifyEnrichWorker();
  if (!spotifyWorker) {
    console.error("[worker] Could not connect to Redis for spotify-enrich.");
    process.exit(1);
  }

  const lastfmWorker = createLastfmImportWorker(processLastfmFullImportJob);
  if (!lastfmWorker) {
    console.error("[worker] Could not connect to Redis for lastfm-full-import.");
    process.exit(1);
  }

  console.log("[worker] started (queues: spotify-enrich, lastfm-full-import)");

  const workers = [
    ["spotify-enrich", spotifyWorker],
    ["lastfm-full-import", lastfmWorker],
  ] as const;

  for (const [name, worker] of workers) {
    worker.on("error", (err) => console.error(`[worker:${name}] error`, err));
    worker.on("completed", (job) => console.log(`[worker:${name}] completed`, job.id, job.name));
    worker.on("failed", (job, err) => console.error(`[worker:${name}] failed`, job?.id, job?.name, err));
  }

  const shutdown = async () => {
    console.log("[worker] shutting down…");
    await Promise.all([spotifyWorker.close(), lastfmWorker.close()]);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main();
