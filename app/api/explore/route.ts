import {
  getOrFetchTracksBatch,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { getLeaderboard } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";
import {
  collectTrackIdsNeedingEnrichment,
  scheduleExploreTrackEnrichment,
} from "@/lib/explore-enrich";
import { exploreLog, exploreLogLine } from "@/lib/explore-perf";

const MAX_TRENDING = 20;

/** DB / cache only — never block on Spotify; background enrichment fills gaps. */
const EXPLORE_CATALOG_DB_ONLY = { allowNetwork: false as const };

export async function GET() {
  const start = Date.now();
  exploreLogLine("explore: start");

  try {
    const tParallel = Date.now();
    const trendingP = (async () => {
      const t = Date.now();
      const r = await getTrendingEntitiesCached(MAX_TRENDING);
      exploreLog("db getTrendingEntitiesCached", Date.now() - t);
      return r;
    })();
    const leaderboardP = (async () => {
      const t = Date.now();
      const r = await getLeaderboard("popular", {}, "song", 8);
      exploreLog("db getLeaderboard", Date.now() - t);
      return r;
    })();
    const [trendingRaw, leaderboardTop] = await Promise.all([trendingP, leaderboardP]);
    exploreLog("db parallel (wall)", Date.now() - tParallel);

    const tTracks = Date.now();
    const trendingTrackIds = trendingRaw.map((e) => e.entity_id);
    const trackArr = await getOrFetchTracksBatch(
      trendingTrackIds,
      EXPLORE_CATALOG_DB_ONLY,
    );
    exploreLog("db getOrFetchTracksBatch (no network)", Date.now() - tTracks);

    const tProcess = Date.now();
    const tracksMap = batchTracksToNormalizedMap(trendingTrackIds, trackArr);
    const trendingEnriched = trendingRaw.map((entity) => ({
      entity,
      track: getTrackFromNormalizedBatchMap(tracksMap, entity.entity_id),
    }));
    exploreLog("process enrich trending", Date.now() - tProcess);

    const toEnrich = collectTrackIdsNeedingEnrichment(trendingTrackIds, tracksMap);
    scheduleExploreTrackEnrichment(toEnrich);

    exploreLogLine(`explore: total: ${Date.now() - start} ms`);

    return apiOk({
      trending: trendingEnriched,
      leaderboard: leaderboardTop,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}
