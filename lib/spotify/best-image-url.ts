/** Matches Spotify Web API image objects (no runtime import — safe in client bundles). */
export type SpotifyImageObject = {
  url?: string | null;
  width?: number | null;
  height?: number | null;
};

/**
 * Pick the best cover URL from a Spotify `images[]` payload (client- and server-safe).
 * Spotify often lists multiple sizes ascending by dimension; taking `[0]` alone can be ~64px.
 */
export function firstSpotifyImageUrl(
  images: SpotifyImageObject[] | undefined | null,
): string | null {
  if (!images?.length) return null;
  const valid = images.filter((im) => im?.url?.trim());
  if (valid.length === 0) return null;
  if (valid.length === 1) return valid[0]!.url!.trim();

  const scored = valid.map((im) => {
    const w = im.width ?? 0;
    const h = im.height ?? 0;
    const area = w > 0 && h > 0 ? w * h : 0;
    return { im, area };
  });
  if (scored.some((s) => s.area > 0)) {
    scored.sort((a, b) => b.area - a.area);
    return scored[0]!.im.url!.trim();
  }
  return valid[valid.length - 1]!.url!.trim();
}
