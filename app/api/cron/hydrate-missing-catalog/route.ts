import { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/api-response";
import {
  runHydrateMissingCatalogFromLogs,
} from "@/lib/catalog-hydration-backfill";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Repairs catalog rows for Last.fm imports / logs that reference Spotify track IDs before `songs`
 * existed (enrichment failed, rate limits, downtime). Also re-fetches placeholder `songs` rows
 * (`name = Track`, no artist) created by legacy paths.
 *
 * Query: `batch` — max tracks to hydrate per run (default 50, max 50). `scan` — log rows to scan (default 4000).
 *
 * Safe to run on a schedule; uses Spotify client credentials + batch `getTracks`.
 */
export async function GET(request: NextRequest) {
  try {
    const admin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);

    const batch = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("batch") ?? "50", 10) || 50),
    );
    const scan = Math.min(
      20_000,
      Math.max(500, parseInt(searchParams.get("scan") ?? "4000", 10) || 4000),
    );

    const result = await runHydrateMissingCatalogFromLogs(admin, {
      hydrateBatchSize: batch,
      logScanLimit: scan,
    });

    return apiOk({
      ok: true,
      ...result,
    });
  } catch (e) {
    console.error("[cron hydrate-missing-catalog]", e);
    return apiError(e instanceof Error ? e.message : "hydration failed", 500);
  }
}
