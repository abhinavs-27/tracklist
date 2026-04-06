import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, apiOk } from "@/lib/api-response";
import {
  hydrateStatsCatalogFromSpotify,
  type HydrateStatsCatalogResult,
} from "@/lib/cron/hydrate-stats-catalog";
import { populatePrecomputedCaches } from "@/lib/cron/populate-precomputed-caches";

const LOG = "[cron][refresh-stats]";

/**
 * Cron: refresh entity_stats, favorite counts, discovery MVs, then snapshot API cache tables
 * (`leaderboard_cache`, `trending_cache`, `community_rankings_cache`).
 * Vercel schedule: daily (`vercel.json`). Same secret as other crons.
 */
export async function GET() {
  // if (!isProd()) {
  //   return apiOk({ ok: false, message: "cron disabled outside prod" });
  // }

  // const authHeader = request.headers.get("authorization");
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return apiUnauthorized();
  // }

  const runStarted = Date.now();
  console.log(LOG, "start", {
    SPOTIFY_REFRESH_DISABLED: process.env.SPOTIFY_REFRESH_DISABLED === "true",
  });

  const supabase = createSupabaseAdminClient();

  let t = Date.now();
  const { error: statsError } = await supabase.rpc("refresh_entity_stats");
  console.log(LOG, "refresh_entity_stats", {
    ok: !statsError,
    ms: Date.now() - t,
    error: statsError?.message,
  });
  if (statsError) {
    console.error(LOG, "refresh_entity_stats failed", statsError);
    console.log(LOG, "done", { success: false, totalMs: Date.now() - runStarted });
    return apiError(statsError.message, 500);
  }

  t = Date.now();
  const { error: favError } = await supabase.rpc(
    "sync_favorite_counts_from_user_favorite_albums",
  );
  console.log(LOG, "sync_favorite_counts_from_user_favorite_albums", {
    ok: !favError,
    ms: Date.now() - t,
    error: favError?.message,
  });
  if (favError) {
    console.error(LOG, "sync_favorite_counts failed", favError);
    console.log(LOG, "done", { success: false, totalMs: Date.now() - runStarted });
    return apiError(favError.message, 500);
  }

  t = Date.now();
  const { error: discoverError } = await supabase.rpc("refresh_discover_mvs");
  console.log(LOG, "refresh_discover_mvs", {
    ok: !discoverError,
    ms: Date.now() - t,
    error: discoverError?.message ?? null,
  });
  if (discoverError) {
    console.warn(
      LOG,
      "refresh_discover_mvs skipped (non-fatal if migration missing):",
      discoverError.message,
    );
  }

  let precomputedCaches: Awaited<
    ReturnType<typeof populatePrecomputedCaches>
  > | null = null;
  try {
    precomputedCaches = await populatePrecomputedCaches();
    console.log(LOG, "populate_precomputed_caches", {
      leaderboardRows: precomputedCaches.leaderboardRows,
      trending: precomputedCaches.trending,
      communityRows: precomputedCaches.communityRows,
      errorCount: precomputedCaches.errors.length,
    });
  } catch (e) {
    console.warn(
      LOG,
      "populate_precomputed_caches failed (non-fatal)",
      e instanceof Error ? e.message : e,
    );
  }

  let catalogHydration: HydrateStatsCatalogResult | null = null;
  let catalogHydrationError: string | null = null;
  try {
    const maxAlbums = parseInt(
      process.env.STATS_HYDRATE_MAX_ALBUMS ?? "500",
      10,
    );
    const maxTracks = parseInt(
      process.env.STATS_HYDRATE_MAX_TRACKS ?? "200",
      10,
    );
    console.log(LOG, "hydrate_stats_catalog_begin", {
      STATS_HYDRATE_MAX_ALBUMS: Number.isFinite(maxAlbums) ? maxAlbums : 500,
      STATS_HYDRATE_MAX_TRACKS: Number.isFinite(maxTracks) ? maxTracks : 200,
    });
    t = Date.now();
    catalogHydration = await hydrateStatsCatalogFromSpotify(supabase, {
      maxAlbums: Number.isFinite(maxAlbums) ? maxAlbums : 500,
      maxTracks: Number.isFinite(maxTracks) ? maxTracks : 200,
    });
    console.log(LOG, "hydrate_stats_catalog_summary", {
      ms: Date.now() - t,
      hydrationMode: catalogHydration.hydrationMode,
      trendingSongIdsFromMv: catalogHydration.trendingSongIdsFromMv,
      lfmOrphanSongsLinked: catalogHydration.lfmOrphanSongsLinked,
      albumIdsAttempted: catalogHydration.albumIdsAttempted,
      albumsUpserted: catalogHydration.albumsUpserted,
      albumsSpotifyFetched: catalogHydration.albumsSpotifyFetched,
      albumsSpotifyFetchFailures: catalogHydration.albumsSpotifyFetchFailures,
      albumsMissingCoverAfter: catalogHydration.albumsMissingCoverAfter,
      trackIdsAttempted: catalogHydration.trackIdsAttempted,
      tracksSkippedAlreadyHadCover: catalogHydration.tracksSkippedAlreadyHadCover,
      tracksUpserted: catalogHydration.tracksUpserted,
      tracksSpotifyFetched: catalogHydration.tracksSpotifyFetched,
      tracksSpotifyFetchFailures: catalogHydration.tracksSpotifyFetchFailures,
      albumCoversFilledFromLastfm: catalogHydration.albumCoversFilledFromLastfm,
      albumsMissingCoverForTrackScopeAfter:
        catalogHydration.albumsMissingCoverForTrackScopeAfter,
      skippedNonSpotifyTrackIds: catalogHydration.skippedNonSpotifyTrackIds,
    });
  } catch (e) {
    catalogHydrationError =
      e instanceof Error ? e.message : String(e);
    console.error(
      LOG,
      "hydrate_stats_catalog_failed (DB stats already refreshed)",
      catalogHydrationError,
    );
  }

  const totalMs = Date.now() - runStarted;
  console.log(LOG, "done", { success: true, totalMs });
  return apiOk({
    ok: true,
    totalMs,
    precomputedCaches,
    catalogHydration,
    catalogHydrationError,
  });
}
