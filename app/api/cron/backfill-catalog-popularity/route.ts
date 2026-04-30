import { NextRequest } from "next/server";

import { apiOk, apiError, apiServiceUnavailable } from "@/lib/api-response";
import { runCatalogPopularityBackfill } from "@/lib/catalog-popularity-backfill";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Catalog popularity backfill (Last.fm): writes `songs.popularity` and `artists.popularity`
 * via track.getInfo / artist.getInfo (name-based, autocorrect on).
 *
 * Requires **server** env: `LASTFM_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * Query: `songs` / `artists` — batch size (defaults 8), `spacing` — ms between rows (default 0).
 * `filled=1` — refresh rows that already have popularity (e.g. migrate off legacy Spotify scores).
 * Check JSON: `totalSongsWithNullPopularity`, `errorSamples`, `warnings`, `dbError`.
 */
export async function GET(request: NextRequest) {
  try {
    const lastfmConfigured = Boolean(process.env.LASTFM_API_KEY?.trim());
    if (!lastfmConfigured) {
      return apiServiceUnavailable(
        "Missing LASTFM_API_KEY. Add it to the environment for this Next.js server."
      );
    }

    const admin = createSupabaseAdminClient();
    const { searchParams } = new URL(request.url);

    const parseIntClamped = (key: string, def: number, max: number): number => {
      const v = parseInt(searchParams.get(key) ?? String(def), 10);
      if (!Number.isFinite(v) || v < 0) return def;
      return Math.min(max, v);
    };

    const includeFilled =
      searchParams.get("filled") === "1" ||
      searchParams.get("includeFilled") === "1";

    const result = await runCatalogPopularityBackfill(admin, {
      songBatch: parseIntClamped("songs", 50, 50),
      artistBatch: parseIntClamped("artists", 50, 50),
      spacingMs: parseIntClamped("spacing", 0, 5000),
      includeFilled,
    });

    return apiOk({
      ok: true,
      lastfmConfigured: true,
      includeFilled,
      ...result,
    });
  } catch (e) {
    console.error("[cron backfill-catalog-popularity]", e);
    return apiError(e instanceof Error ? e.message : "backfill failed", 500);
  }
}
