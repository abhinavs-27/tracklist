import { NextRequest } from "next/server";
import { getHiddenGemsCached } from "@/lib/discover-cache";
import { enrichTracksAsync } from "@/lib/discover-enrich";
import { getChartConfig } from "@/lib/discovery/chartConfigs";
import {
  albumStubMetadataComplete,
  scheduleAlbumEnrichment,
} from "@/lib/catalog/non-blocking-enrichment";
import {
  batchResultsToMap,
  batchTracksToNormalizedMap,
  getOrFetchAlbumsBatch,
  getOrFetchTracksBatch,
  getTrackFromNormalizedBatchMap,
} from "@/lib/spotify-cache";
import { apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkDiscoverRateLimit } from "@/lib/rate-limit";
import { clampLimit } from "@/lib/validation";
import type { HiddenGemGridItem } from "@/types";

const DISCOVER_CATALOG_OPTS = { allowNetwork: false as const };

const DISCOVER_TRACKS_DB_ONLY = { allowNetwork: false as const };

function trackAlbumArtworkUrl(
  track: SpotifyApi.TrackObjectFull | null,
): string | null {
  if (!track) return null;
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  for (const im of imgs) {
    const u = im?.url?.trim();
    if (u) return u;
  }
  return null;
}

/** GET – hidden gems with Spotify/DB artwork + titles for mobile grid. Public. Same query params as `/api/discover/hidden-gems`. */
export async function GET(request: NextRequest) {
  if (!checkDiscoverRateLimit(request)) {
    return apiTooManyRequests();
  }

  try {
    const hiddenGemsConfig = getChartConfig("hidden_gems");
    const defaultMinRating = hiddenGemsConfig?.filters?.min_rating ?? 4;
    const defaultMaxListens = hiddenGemsConfig?.filters?.max_plays ?? 50;

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 20, 20);
    const minRating = Math.min(
      Math.max(
        0,
        parseFloat(searchParams.get("minRating") ?? String(defaultMinRating)) ||
          defaultMinRating,
      ),
      5,
    );
    const maxListens = Math.min(
      Math.max(
        0,
        parseInt(
          searchParams.get("maxListens") ?? String(defaultMaxListens),
          10,
        ) || defaultMaxListens,
      ),
      10000,
    );

    const hiddenGemsRaw = await getHiddenGemsCached(limit, minRating, maxListens);

    const songIds: string[] = [];
    const albumIds: string[] = [];
    for (const g of hiddenGemsRaw) {
      if (g.entity_type?.toLowerCase() === "album") {
        albumIds.push(g.entity_id);
      } else {
        songIds.push(g.entity_id);
      }
    }

    const [trackArr, albumArr] = await Promise.all([
      getOrFetchTracksBatch(songIds, DISCOVER_TRACKS_DB_ONLY),
      getOrFetchAlbumsBatch(albumIds, DISCOVER_CATALOG_OPTS),
    ]);

    const tracksMap = batchTracksToNormalizedMap(songIds, trackArr);
    const albumsMap = batchResultsToMap(albumIds, albumArr);

    enrichTracksAsync({ tracksMap, entityIds: songIds });

    for (let i = 0; i < albumIds.length; i++) {
      const al = albumArr[i];
      if (!albumStubMetadataComplete(al)) {
        scheduleAlbumEnrichment(albumIds[i]!);
      }
    }

    const out: HiddenGemGridItem[] = [];

    for (const gem of hiddenGemsRaw) {
      if (gem.entity_type?.toLowerCase() === "album") {
        const album = albumsMap.get(gem.entity_id) ?? null;
        if (!album) continue;
        const artwork =
          Array.isArray(album.images) && album.images.length > 0
            ? album.images[0]!.url ?? null
            : null;
        const artistLine =
          (album.artists ?? [])
            .map((a) => a.name)
            .filter(Boolean)
            .join(", ") || "Album";
        out.push({
          entity_id: gem.entity_id,
          entity_type: "album",
          title: album.name,
          artist: artistLine,
          artwork_url: artwork,
          avg_rating: gem.avg_rating,
          listen_count: gem.listen_count,
        });
      } else {
        const track = getTrackFromNormalizedBatchMap(tracksMap, gem.entity_id);
        if (!track) continue;
        const artwork = trackAlbumArtworkUrl(track);
        const artistLine =
          (track.artists ?? [])
            .map((a) => a.name)
            .filter(Boolean)
            .join(", ") || "Artist";
        out.push({
          entity_id: gem.entity_id,
          entity_type: "song",
          title: track.name,
          artist: artistLine,
          artwork_url: artwork,
          avg_rating: gem.avg_rating,
          listen_count: gem.listen_count,
        });
      }
    }

    return apiOk(out);
  } catch (e) {
    return apiInternalError(e);
  }
}
