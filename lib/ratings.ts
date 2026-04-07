/**
 * Half-star review ratings (1, 1.5, …, 5) — shared by API validation and UI.
 */

export const HALF_STAR_RATINGS = [
  1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5,
] as const;

export type HalfStarRating = (typeof HALF_STAR_RATINGS)[number];

/** Empty histogram / default stats object (string keys for JSONB). */
export function defaultRatingDistribution(): Record<string, number> {
  return Object.fromEntries(
    HALF_STAR_RATINGS.map((k) => [String(k), 0]),
  ) as Record<string, number>;
}

/** Merge DB JSONB (legacy 1–5 only or full half-step keys) into a complete map. */
export function normalizeRatingDistribution(raw: unknown): Record<string, number> {
  const base = defaultRatingDistribution();
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    for (const k of Object.keys(base)) {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v)) base[k] = v;
      else if (typeof v === "string" && v !== "") {
        const n = Number(v);
        if (Number.isFinite(n)) base[k] = n;
      }
    }
  }
  return base;
}

/**
 * Text stars for a rating in half-star steps (uses ½ between whole stars).
 * Clamps to [0, 5]; averages can be passed through `roundRatingToHalfStep` first.
 */
export function formatStarDisplay(rating: number): string {
  const r = Math.max(0, Math.min(5, Number(rating)));
  const halves = Math.round(r * 2) / 2;
  const full = Math.floor(halves);
  const hasHalf = halves - full >= 0.5 && halves < 5;
  const empty = 5 - full - (hasHalf ? 1 : 0);
  return "★".repeat(full) + (hasHalf ? "½" : "") + "☆".repeat(Math.max(0, empty));
}

/** Round any numeric average to the nearest half star for display. */
export function roundRatingToHalfStep(rating: number): number {
  const r = Math.max(0, Math.min(5, Number(rating)));
  return Math.round(r * 2) / 2;
}

/** Bucket a stored rating into a distribution key (e.g. 2.5 → "2.5"). */
export function ratingDistributionKey(rating: number): string {
  const r = Number(rating);
  if (!Number.isFinite(r)) return "1";
  const halves = Math.round(r * 2);
  const clamped = Math.max(2, Math.min(10, halves));
  return String(clamped / 2);
}
