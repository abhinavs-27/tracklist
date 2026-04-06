import type { ExploreHubTrendingItem } from "@/lib/types/explore-hub";

/** Album art from full Spotify JSON or from `?lite=true` `image_url`. */
export function exploreTrackArtworkUrl(
  track: NonNullable<ExploreHubTrendingItem["track"]>,
): string | null {
  if (
    "image_url" in track &&
    track.image_url != null &&
    String(track.image_url).trim() !== ""
  ) {
    return String(track.image_url).trim();
  }
  const imgs = track.album?.images;
  if (!imgs?.length) return null;
  for (const im of imgs) {
    const u = im?.url?.trim();
    if (u) return u;
  }
  return null;
}
