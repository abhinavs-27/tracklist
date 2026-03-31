/**
 * Local CLI for catalog dedupe (same logic as GET /api/cron/merge-catalog-duplicates).
 *
 *   npx tsx scripts/merge-catalog-duplicates.ts
 *   npx tsx scripts/merge-catalog-duplicates.ts --dry-run
 *   npx tsx scripts/merge-catalog-duplicates.ts --max-rounds=30
 *
 * Requires: .env with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Migrations: 104+ (merge_pair), 110 (list_* RPCs).
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { runMergeCatalogDuplicates } from "../lib/cron/merge-catalog-duplicates";

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

async function main() {
  loadEnvFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dryRun = process.argv.includes("--dry-run");
  const maxRoundsArg = process.argv.find((a) => a.startsWith("--max-rounds="));
  const maxRounds = maxRoundsArg
    ? Math.max(1, Math.min(200, parseInt(maxRoundsArg.split("=")[1] ?? "50", 10)))
    : 50;

  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set in .env or environment).",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(
    dryRun
      ? "DRY RUN — no merges will be performed."
      : "Running per-pair merges (tracks → albums → artists each round).",
  );
  console.log(`max rounds: ${maxRounds}`);

  const result = await runMergeCatalogDuplicates(supabase, { maxRounds, dryRun });

  for (const r of result.rounds) {
    console.log(
      `round ${r.round}: tracks=${r.tracksOk} albums=${r.albumsOk} artists=${r.artistsOk} errors=${r.errors.length}`,
    );
    for (const e of r.errors) {
      console.error(`  [${e.kind}] ${e.loserId} → ${e.winnerId}: ${e.message}`);
    }
  }
  for (const msg of result.listRpcErrors) {
    console.error("list RPC:", msg);
  }
  if (result.refreshEntityStatsError) {
    console.warn("refresh_entity_stats:", result.refreshEntityStatsError);
  } else if (result.refreshEntityStatsOk) {
    console.log("refresh_entity_stats: ok");
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
