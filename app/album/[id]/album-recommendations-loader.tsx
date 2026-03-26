import { getRelatedMedia } from "@/lib/discovery/getRelatedMedia";
import { getOrFetchAlbumsBatch } from "@/lib/spotify-cache";
import { AlbumRecommendationsSection } from "./album-recommendations-section";

/** Deferred so the main album shell can stream without waiting on discovery + batch album fetches. */
export async function AlbumRecommendationsLoader({
  albumId,
  albumName,
}: {
  albumId: string;
  albumName: string;
}) {
  let related: Awaited<ReturnType<typeof getRelatedMedia>> = [];
  try {
    related = await getRelatedMedia("album", albumId, 10);
  } catch (e) {
    console.error("[album] getRelatedMedia failed:", e);
  }
  const recommendationAlbumIds = related.map(
    (r: { contentId: string }) => r.contentId,
  );
  const recommendationAlbumResults =
    recommendationAlbumIds.length > 0
      ? await getOrFetchAlbumsBatch(recommendationAlbumIds)
      : [];
  const recommendedAlbums = recommendationAlbumResults.filter(
    (a): a is SpotifyApi.AlbumObjectSimplified => a != null,
  );
  if (recommendedAlbums.length === 0) return null;
  return (
    <AlbumRecommendationsSection
      albums={recommendedAlbums}
      albumName={albumName}
    />
  );
}
