/**
 * Normalize Last.fm / Spotify strings for fuzzy matching (track, artist, album).
 */

function stripDiacritics(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "");
}

/** Remove balanced parentheses segments; repeat until stable for nested cases. */
function removeParentheses(s: string): string {
  let prev = "";
  let out = s;
  while (prev !== out) {
    prev = out;
    out = out.replace(/\([^)]*\)/g, " ");
  }
  return out;
}

const TRAILING_VERSION = [
  /\s*-\s*remastered(?:\s*\d{4})?\b/gi,
  /\s*-\s*remaster\b/gi,
  /\s*-\s*deluxe(?:\s*edition)?\b/gi,
  /\s*-\s*explicit\b/gi,
  /\s*-\s*clean\b/gi,
  /\s*-\s*radio\s*edit\b/gi,
  /\s*-\s*single\b/gi,
  /\s*-\s*mono\b/gi,
  /\s*-\s*stereo\b/gi,
];

/** Non-parenthetical "feat." tails (Last.fm sometimes omits parens). */
const FEAT_TAIL =
  /\s+(?:feat\.|ft\.|featuring)\s+.+$/i;

const BRACKET_CONTENT = /\[[^\]]*\]/g;

/**
 * Lowercase, strip accents, remove version noise / feats / parens, normalize &/punctuation.
 */
export function normalizeForMatch(input: string): string {
  let s = stripDiacritics(input.trim().toLowerCase());
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(BRACKET_CONTENT, " ");
  s = s.replace(FEAT_TAIL, " ");
  s = removeParentheses(s);
  for (const re of TRAILING_VERSION) {
    s = s.replace(re, " ");
  }
  s = s.replace(/\s*-\s*remaster(?:ed)?\b/gi, " ");
  s = s.replace(/\bexplicit\b|\bdeluxe\b|\bremaster(?:ed)?\b/gi, " ");
  s = s.replace(/\s*&\s*/g, " and ");
  s = s.replace(/,/g, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * First billed artist: strip "A & B", "A, B", "A feat. X", etc.
 */
export function primaryArtistSegment(artist: string): string {
  const t = artist.trim();
  if (!t) return "";
  const lower = t.toLowerCase();
  const seps: { s: string; idx: number }[] = [
    { s: ",", idx: lower.indexOf(",") },
    { s: " feat.", idx: lower.indexOf(" feat.") },
    { s: " ft.", idx: lower.indexOf(" ft.") },
    { s: " featuring", idx: lower.indexOf(" featuring") },
    { s: " x ", idx: lower.indexOf(" x ") },
  ];
  let cut = Infinity;
  for (const { idx } of seps) {
    if (idx !== -1 && idx < cut) cut = idx;
  }
  let head = cut === Infinity ? t : t.slice(0, cut);
  head = head.replace(/\s*&\s*/g, " and ");
  const amp = head.toLowerCase().indexOf(" and ");
  if (amp !== -1) head = head.slice(0, amp);
  return head.trim();
}

function tokenSet(s: string): Set<string> {
  const parts = normalizeForMatch(s).split(" ").filter(Boolean);
  return new Set(parts);
}

/** Jaccard similarity on word tokens (0–1). */
export function tokenJaccard(a: string, b: string): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function trackTitleSimilarity(
  expectedRaw: string,
  spotifyName: string,
): { score: number; label: string } {
  const a = normalizeForMatch(expectedRaw);
  const b = normalizeForMatch(spotifyName);
  if (!a || !b) return { score: 0, label: "empty" };
  if (a === b) return { score: 50, label: "track_exact" };
  const minL = Math.min(a.length, b.length);
  if (minL >= 4 && (a.includes(b) || b.includes(a))) {
    return { score: 45, label: "track_substring" };
  }
  const j = tokenJaccard(a, b);
  if (j >= 0.72) return { score: 40, label: "track_tokens_high" };
  if (j >= 0.45) return { score: 28, label: "track_tokens_mid" };
  return { score: 0, label: "track_weak" };
}

export function artistMatches(
  expectedArtistRaw: string,
  spotifyArtistNames: string[],
): { score: number; label: string } {
  const primary = normalizeForMatch(primaryArtistSegment(expectedArtistRaw));
  const full = normalizeForMatch(expectedArtistRaw);
  const spotifyNorm = spotifyArtistNames.map((n) => normalizeForMatch(n)).filter(Boolean);
  if (!primary && !full) return { score: 0, label: "artist_empty" };

  for (const sn of spotifyNorm) {
    if (primary && (sn === primary || sn.includes(primary) || primary.includes(sn))) {
      return { score: 30, label: "artist_primary" };
    }
    if (full && (sn === full || full.includes(sn) || sn.includes(full))) {
      return { score: 28, label: "artist_full" };
    }
    if (primary && tokenJaccard(primary, sn) >= 0.5) {
      return { score: 22, label: "artist_tokens" };
    }
  }
  return { score: 0, label: "artist_no" };
}

export function albumMatches(
  expectedAlbum: string | null,
  spotifyAlbumName: string | null | undefined,
): { score: number; label: string } {
  if (!expectedAlbum?.trim() || !spotifyAlbumName?.trim()) {
    return { score: 0, label: "album_skip" };
  }
  const a = normalizeForMatch(expectedAlbum);
  const b = normalizeForMatch(spotifyAlbumName);
  if (!a || !b) return { score: 0, label: "album_empty" };
  if (a === b) return { score: 20, label: "album_exact" };
  if (a.includes(b) || b.includes(a)) return { score: 16, label: "album_sub" };
  if (tokenJaccard(a, b) >= 0.45) return { score: 12, label: "album_tokens" };
  return { score: 0, label: "album_no" };
}
