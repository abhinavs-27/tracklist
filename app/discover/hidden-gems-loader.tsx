import { getHiddenGemsCached } from "@/lib/discover-cache";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import {
  getOrFetchTracksBatch,
  getOrFetchAlbumsBatch,
  batchResultsToMap,
  batchTracksToNormalizedMap,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { enrichTracksAsync } from "@/lib/discover-enrich";
import { HiddenGemsSection } from "./hidden-gems-section";

const MAX_ITEMS = 20;
const DISCOVER_CATALOG_OPTS = {
  allowNetwork: process.env.SPOTIFY_REFRESH_DISABLED !== "true",
} as const;
const DISCOVER_TRACKS_DB_ONLY = { allowNetwork: false as const };

export async function HiddenGemsLoader() {
  const hiddenGemsConfig = getChartConfig("hidden_gems");
  const hiddenGemsMinRating = hiddenGemsConfig?.filters?.min_rating ?? 4;
  const hiddenGemsMaxListens = hiddenGemsConfig?.filters?.max_plays ?? 50;

  const hiddenGemsRaw = await getHiddenGemsCached(
    MAX_ITEMS,
    hiddenGemsMinRating,
    hiddenGemsMaxListens,
  );

  const hiddenGemsByType = { song: [] as string[], album: [] as string[] };
  for (const g of hiddenGemsRaw) {
    if (g.entity_type === "album") hiddenGemsByType.album.push(g.entity_id);
    else hiddenGemsByType.song.push(g.entity_id);
  }

  const [trackArr, albumArr] = await Promise.all([
    getOrFetchTracksBatch(hiddenGemsByType.song, DISCOVER_TRACKS_DB_ONLY),
    getOrFetchAlbumsBatch(hiddenGemsByType.album, DISCOVER_CATALOG_OPTS),
  ]);

  const tracksMap = batchTracksToNormalizedMap(hiddenGemsByType.song, trackArr);
  const albumsMap = batchResultsToMap(hiddenGemsByType.album, albumArr);

  const hiddenGemsEnriched = hiddenGemsRaw.map((gem) => {
    if (gem.entity_type === "album") {
      const album = albumsMap.get(gem.entity_id) ?? null;
      return { gem, album, track: null };
    }
    const track = getTrackFromNormalizedBatchMap(tracksMap, gem.entity_id);
    return { gem, album: null, track };
  });

  enrichTracksAsync({ tracksMap, entityIds: hiddenGemsByType.song });

  return <HiddenGemsSection items={hiddenGemsEnriched} />;
}
