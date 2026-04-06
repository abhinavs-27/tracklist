import {
  getOrFetchTracksBatch,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/queries";
import {
  collectTrackIdsNeedingEnrichment,
  scheduleExploreTrackEnrichment,
} from "@/lib/explore-enrich";
import { exploreLog } from "@/lib/explore-perf";
import type { TrendingEntity } from "@/types";

const MAX_TRENDING = 20;

/** DB / cache only — never block on Spotify; background enrichment fills gaps. */
const EXPLORE_CATALOG_DB_ONLY = { allowNetwork: false as const };

export type ExploreHubTrendingRow = {
  entity: TrendingEntity;
  track: SpotifyApi.TrackObjectFull | null;
};

export type ExploreHubPayload = {
  trending: ExploreHubTrendingRow[];
  leaderboard: LeaderboardEntry[];
};

export async function getExploreTrendingPayload(): Promise<{
  trending: ExploreHubTrendingRow[];
}> {
  const tParallel = Date.now();
  const trendingP = (async () => {
    const t = Date.now();
    const r = await getTrendingEntitiesCached(MAX_TRENDING);
    exploreLog("db getTrendingEntitiesCached", Date.now() - t);
    return r;
  })();
  const trendingRaw = await trendingP;
  exploreLog("db parallel (wall)", Date.now() - tParallel);

  const trendingTrackIds = trendingRaw.map((e) => e.entity_id);
  const tTracks = Date.now();
  const trackArr = await getOrFetchTracksBatch(
    trendingTrackIds,
    EXPLORE_CATALOG_DB_ONLY,
  );
  exploreLog("db getOrFetchTracksBatch (no network)", Date.now() - tTracks);

  const tProcess = Date.now();
  const tracksMap = batchTracksToNormalizedMap(trendingTrackIds, trackArr);
  const trending = trendingRaw.map((entity) => ({
    entity,
    track: getTrackFromNormalizedBatchMap(tracksMap, entity.entity_id),
  }));
  exploreLog("process enrich trending", Date.now() - tProcess);

  const toEnrich = collectTrackIdsNeedingEnrichment(trendingTrackIds, tracksMap);
  scheduleExploreTrackEnrichment(toEnrich);

  return { trending };
}

export async function getExploreLeaderboardPayload(): Promise<{
  leaderboard: LeaderboardEntry[];
}> {
  const t = Date.now();
  const leaderboardTop = await getLeaderboard("popular", {}, "song", 8);
  exploreLog("db getLeaderboard", Date.now() - t);
  return { leaderboard: leaderboardTop };
}

/**
 * Shared by `GET /api/explore` (legacy combined) and callers that want both in one
 * round-trip. Prefer independent `/api/explore/trending` + `/leaderboard` for progressive UI.
 */
export async function getExploreHubPayload(): Promise<ExploreHubPayload> {
  const [trendingRes, leaderboardRes] = await Promise.all([
    getExploreTrendingPayload(),
    getExploreLeaderboardPayload(),
  ]);
  return {
    trending: trendingRes.trending,
    leaderboard: leaderboardRes.leaderboard,
  };
}
