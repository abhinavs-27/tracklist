/**
 * Resolve cover art from feed `album` payloads (Spotify `images[]`, DB `image_url`, or both).
 */
export function feedAlbumCoverUrl(
  album:
    | {
        images?: { url?: string | null }[] | null;
        image_url?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!album) return null;
  const fromImages = album.images?.[0]?.url;
  if (typeof fromImages === "string" && fromImages.trim()) {
    return fromImages.trim();
  }
  const raw = album.image_url;
  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  return null;
}
