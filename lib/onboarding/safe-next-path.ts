/**
 * Validates `next` query for post-onboarding redirects. Blocks open redirects.
 * Only same-origin relative paths starting with `/` (not `//`).
 */
export function safeOnboardingNextPath(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length === 0 || t.length > 512) return null;
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  if (t.includes("://") || t.includes("\\")) return null;
  return t;
}
