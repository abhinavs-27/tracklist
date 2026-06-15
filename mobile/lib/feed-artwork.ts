import { firstSpotifyImageUrl } from "@/lib/spotify/best-image-url";

/**
 * Resolve cover art from feed `album` payloads (Spotify `images[]`, DB `image_url`, or both).
 * Prefer largest `images[]` entry when multiple sizes exist (avoid tiny `[0]` covers).
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
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
}
