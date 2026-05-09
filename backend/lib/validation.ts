/**
 * Centralized validation and sanitization for API inputs (Express version).
 * Keep in sync with `lib/validation.ts`.
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
} as const;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Loose 36-character hex + hyphen shape for route-layer enforcement ("must look like a UUID").
 */
export function isUUID(id: string): boolean {
  return /^[0-9a-fA-F-]{36}$/.test(id);
}

export function isValidSpotifyId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length <= 22 && SPOTIFY_ID_REGEX.test(value)
  );
}

export function isValidLfmCatalogId(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return LFM_CATALOG_ID_REGEX.test(value.trim());
}

export function isValidUsername(value: unknown): value is string {
  return typeof value === "string" && USERNAME_REGEX.test(value);
}

export function clampLimit(
  value: unknown,
  max: number,
  defaultVal: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(Math.floor(n), max);
}

export function sanitizeString(
  value: unknown,
  maxLength: number,
): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value.trim() : String(value).trim();
  if (s.length === 0) return null;
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

export function validateCommentContent(
  content: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  const s = sanitizeString(content, LIMITS.COMMENT_CONTENT);
  if (s === null || s.length === 0)
    return { ok: false, error: "content cannot be empty" };
  return { ok: true, value: s };
}

export function validateReviewContent(review: unknown): string | null {
  return sanitizeString(review, LIMITS.REVIEW_CONTENT);
}

export function validateUsernameUpdate(
  username: unknown,
): { ok: true; value: string } | { ok: false; error: string } {
  if (username == null) return { ok: false, error: "username is required" };
  const s =
    typeof username === "string"
      ? username.trim()
      : String(username).trim().toLowerCase();
  if (s.length === 0) return { ok: false, error: "username cannot be empty" };
  if (!USERNAME_REGEX.test(s)) {
    return {
      ok: false,
      error:
        "username must be 3–32 characters, lowercase letters, numbers, or underscore",
    };
  }
  return { ok: true, value: s };
}

export function validateEntityType(type: unknown): { ok: true; value: 'album' | 'song' } | { ok: false; error: string } {
  if (type !== 'album' && type !== 'song') {
    return { ok: false, error: "entity_type must be 'album' or 'song'" };
  }
  return { ok: true, value: type as 'album' | 'song' };
}

export function validateListType(type: unknown): { ok: true; value: 'album' | 'song' } | { ok: false; error: string } {
  const res = validateEntityType(type);
  if (!res.ok) return { ok: false, error: "type must be 'album' or 'song'" };
  return res;
}

export function validateRating(
  rating: unknown,
): { ok: true; value: number } | { ok: false; error: string } {
  const r =
    typeof rating === "string" ? Number(rating.trim()) : Number(rating);
  if (!Number.isFinite(r)) {
    return {
      ok: false,
      error: "rating must be a number between 1 and 5 in half-star steps",
    };
  }
  const halves = Math.round(r * 2);
  if (halves < 2 || halves > 10) {
    return { ok: false, error: "rating must be between 1 and 5" };
  }
  if (Math.abs(r * 2 - halves) > 1e-9) {
    return {
      ok: false,
      error: "rating must use half-star steps (1, 1.5, 2, … 5)",
    };
  }
  return { ok: true, value: halves / 2 };
}
