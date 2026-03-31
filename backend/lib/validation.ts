/**
 * Centralized validation and sanitization for API inputs.
 * Use for all user-provided IDs and text to prevent injection and abuse.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Spotify IDs are 22-char alphanumeric (base62) */
const SPOTIFY_ID_REGEX = /^[a-zA-Z0-9]{22}$/;

/** Synthetic Last.fm cache keys: `lfm:` + 16 hex chars (aligned with app `lib/validation.ts`). */
const LFM_CATALOG_ID_REGEX = /^lfm:[0-9a-f]{16}$/;

/** Same rules as `lib/validation.ts` (Next app): auto-generated names can be up to ~27 chars. */
const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;

export const LIMITS = {
  COMMENT_CONTENT: 2000,
  REVIEW_CONTENT: 10000,
  LOG_TITLE: 500,
  BIO: 500,
  SEARCH_QUERY: 200,
  FEED_LIMIT: 100,
  LOGS_LIMIT: 100,
  /** Spotify `GET /search` `limit` max is 10 (Feb 2026 Web API). */
  SEARCH_LIMIT: 10,
  FOLLOWING_IDS_CAP: 500,
  LIST_TITLE: 100,
  LIST_DESCRIPTION: 2000,
} as const;

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

export function isValidSpotifyId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 22 && SPOTIFY_ID_REGEX.test(value);
}

export function isValidLfmCatalogId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return LFM_CATALOG_ID_REGEX.test(value.trim());
}

export function isValidUsername(value: unknown): value is string {
  return typeof value === 'string' && USERNAME_REGEX.test(value);
}

export function clampLimit(value: unknown, max: number, defaultVal: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(Math.floor(n), max);
}

export function sanitizeString(
  value: unknown,
  maxLength: number
): string | null {
  if (value == null) return null;
  const s = typeof value === 'string' ? value.trim() : String(value).trim();
  if (s.length === 0) return null;
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

export function validateCommentContent(content: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = sanitizeString(content, LIMITS.COMMENT_CONTENT);
  if (s === null || s.length === 0) return { ok: false, error: 'content cannot be empty' };
  return { ok: true, value: s };
}

export function validateReviewContent(review: unknown): string | null {
  return sanitizeString(review, LIMITS.REVIEW_CONTENT);
}

export function validateLogTitle(title: unknown): string | null {
  return sanitizeString(title, LIMITS.LOG_TITLE);
}

export function validateBio(bio: unknown): string | null {
  return sanitizeString(bio, LIMITS.BIO);
}

export function validateAvatarUrl(avatarUrl: unknown): string | null {
  if (avatarUrl == null) return null;
  if (typeof avatarUrl !== 'string') return null;
  const trimmed = avatarUrl.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 2048) return trimmed.slice(0, 2048);
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateSearchQuery(q: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = sanitizeString(q, LIMITS.SEARCH_QUERY);
  if (s === null || s.length === 0) return { ok: false, error: 'Query q is required' };
  return { ok: true, value: s };
}

export function validateUsernameUpdate(
  username: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (username == null)
    return { ok: false, error: "username is required" };
  const s =
    typeof username === "string"
      ? username.trim()
      : String(username).trim().toLowerCase();
  if (s.length === 0)
    return { ok: false, error: "username cannot be empty" };
  if (!USERNAME_REGEX.test(s)) {
    return {
      ok: false,
      error:
        "username must be 3–32 characters, lowercase letters, numbers, or underscore",
    };
  }
  return { ok: true, value: s };
}

export function validateListTitle(title: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const s = sanitizeString(title, LIMITS.LIST_TITLE);
  if (s === null || s.length === 0) return { ok: false, error: 'title is required' };
  return { ok: true, value: s };
}

export function validateListDescription(description: unknown): string | null {
  if (description == null || description === '') return null;
  return sanitizeString(description, LIMITS.LIST_DESCRIPTION);
}

export function validateListType(type: unknown): { ok: true; value: 'album' | 'song' } | { ok: false; error: string } {
  if (type !== 'album' && type !== 'song') {
    return { ok: false, error: "type must be 'album' or 'song'" };
  }
  return { ok: true, value: type };
}

