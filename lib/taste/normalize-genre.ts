/**
 * Normalizes raw Last.fm genre tags for deduplication.
 *
 * Last.fm produces inconsistent tags: "hip-hop", "hip hop", "Hip Hop" are
 * all the same genre. This collapses them to a canonical key so they're
 * counted once, then produces a clean display label.
 *
 * Does NOT semantically merge genres (e.g. "rap" stays separate from
 * "hip-hop") — that level of canonicalization is out of scope here.
 */

/** Canonical dedup key: lowercase, hyphens → spaces, collapsed whitespace. */
export function genreKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
