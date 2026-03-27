/** Parse Last.fm numeric strings (often comma-separated) into a finite number. */
export function parseLastfmCount(v: unknown): number | null {
  if (v == null) return null;
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number.parseInt(v.replace(/,/g, ""), 10)
        : NaN;
  return Number.isFinite(n) ? n : null;
}
