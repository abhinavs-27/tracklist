export type RatingEntry = {
  albumId: string;
  artistId: string;
  rating: number;
};

/** Maps a half-star rating (1–5) to a synthetic play-count weight. < 3★ → 0. */
export function ratingToSyntheticWeight(rating: number): number {
  if (rating >= 5) return 15;
  if (rating >= 4.5) return 12;
  if (rating >= 4) return 8;
  if (rating >= 3.5) return 4;
  if (rating >= 3) return 2;
  return 0;
}

/**
 * Given rated albums (with resolved artistId), returns a Map<artistId, syntheticCount>
 * suitable for merging with log-derived artistCounts in computeTasteIdentity.
 */
export function ratingsToArtistCountMap(
  ratings: RatingEntry[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const { artistId, rating } of ratings) {
    if (!artistId) continue;
    const weight = ratingToSyntheticWeight(rating);
    if (weight === 0) continue;
    out.set(artistId, (out.get(artistId) ?? 0) + weight);
  }
  return out;
}
