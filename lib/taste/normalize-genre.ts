/**
 * Normalizes raw Last.fm / Spotify genre tags for deduplication.
 *
 * Two levels of normalization:
 * 1. Surface: lowercase, hyphens → spaces, collapse whitespace.
 * 2. Semantic: merge synonymous tags ("rap" → "hip hop", etc.) so they
 *    accumulate into a single bucket instead of fragmenting the top-genres list.
 */

/**
 * Synonyms that should merge into a single canonical key.
 * Keys are already surface-normalized (lowercase, spaces, trimmed).
 */
const GENRE_MERGE: Record<string, string> = {
  // Rap / Hip-Hop
  "rap":                    "hip hop",
  "hiphop":                 "hip hop",
  "underground rap":        "underground hip hop",
  "trap rap":               "trap",
  "gangster rap":           "gangsta rap",

  // R&B
  "rhythm and blues":       "r&b",
  "rnb":                    "r&b",

  // Rock
  "rock and roll":          "rock n roll",
  "rock & roll":            "rock n roll",

  // Soul
  "neo soul":               "neo-soul",
};

/** Canonical dedup key: surface-normalize then apply semantic merges. */
export function genreKey(raw: string): string {
  const surface = raw
    .toLowerCase()
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return GENRE_MERGE[surface] ?? surface;
}

/**
 * Clean display label for a genre tag.
 * Uses the original casing of the first-seen variant but falls back to
 * title-casing the normalized key so it always looks intentional.
 * Special-cases common abbreviations like "r&b", "uk", "edm".
 */
const ABBR: Record<string, string> = {
  "r&b": "R&B",
  "rnb": "R&B",
  "uk": "UK",
  "us": "US",
  "edm": "EDM",
  "lo-fi": "Lo-Fi",
  "lo fi": "Lo-Fi",
};

export function genreLabel(raw: string): string {
  const key = genreKey(raw);
  if (ABBR[key]) return ABBR[key];
  // Title-case each word
  return key.replace(/\b\w/g, (c) => c.toUpperCase());
}
