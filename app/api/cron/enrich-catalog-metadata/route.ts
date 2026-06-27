import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  runDateEnrichmentBatch,
  runTrackOrderEnrichmentBatch,
} from "@/lib/cron/enrich-catalog-metadata";

export const maxDuration = 60;

const DEFAULT_DATES = 150;
const DEFAULT_TRACKS = 150;
const MAX_BATCH = 500;

function parseLimit(raw: string | null, dflt: number): number {
  const n = parseInt(raw ?? String(dflt), 10);
  if (!Number.isFinite(n) || n < 1) return dflt;
  return Math.min(n, MAX_BATCH);
}

/**
 * Weekly catalog enrichment (Deezer-only): fills missing album release dates and
 * track numbers for recent / newly-grown albums. Authorization: Bearer CRON_SECRET.
 * Params: ?dates=N&tracks=N (defaults 150/150, capped 500).
 */
export async function GET(request: NextRequest | Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return apiUnauthorized();
  }

  const url = new URL(request.url);
  const dateLimit = parseLimit(url.searchParams.get("dates"), DEFAULT_DATES);
  const trackLimit = parseLimit(url.searchParams.get("tracks"), DEFAULT_TRACKS);

  const supabase = createSupabaseAdminClient();
  const dates = await runDateEnrichmentBatch(supabase, dateLimit);
  const tracks = await runTrackOrderEnrichmentBatch(supabase, trackLimit);

  console.log("[cron/enrich-catalog-metadata] done", { dates, tracks });
  return apiOk({ dates, tracks });
}
