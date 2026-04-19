import { firstSpotifyImageUrl } from "@/lib/spotify/best-image-url";

/**
 * Cover URL for feed listen rows / heroes. Prefer the largest `images[]` entry when Spotify
 * sends multiple sizes; fall back to `image_url` (e.g. DB-only payloads).
 */
export function feedAlbumCoverUrl(
  album:
    | {
        images?: { url?: string | null; width?: number | null; height?: number | null }[] | null;
        image_url?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!album) return null;
  const fromImages = firstSpotifyImageUrl(album.images);
  if (fromImages) return fromImages;
  const raw = album.image_url;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}
