import { getTrendingEntitiesCached } from "@/lib/discover-cache";
import {
  getOrFetchTracksBatch,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { enrichTracksAsync } from "@/lib/discover-enrich";
import { TrendingSection } from "./trending-section";

const MAX_ITEMS = 20;
const DISCOVER_TRACKS_DB_ONLY = { allowNetwork: false as const };

export async function TrendingLoader() {
  const trendingRaw = await getTrendingEntitiesCached(MAX_ITEMS);
  const trendingTrackIds = trendingRaw.map((e) => e.entity_id);

  const trackArr = await getOrFetchTracksBatch(trendingTrackIds, DISCOVER_TRACKS_DB_ONLY);
  const tracksMap = batchTracksToNormalizedMap(trendingTrackIds, trackArr);

  const trendingEnriched = trendingRaw.map((entity) => ({
    entity,
    track: getTrackFromNormalizedBatchMap(tracksMap, entity.entity_id),
  }));

  enrichTracksAsync({ tracksMap, entityIds: trendingTrackIds });

  return <TrendingSection items={trendingEnriched} />;
}
