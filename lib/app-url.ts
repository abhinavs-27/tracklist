/**
 * Single source of truth for the app's base URL. Ensures production never
 * uses localhost (e.g. when NEXTAUTH_URL is mistakenly set to 127.0.0.1).
 */

/** Exported for use in Spotify redirect URI logic (never use localhost in prod). */
export function isLocalhostUrl(url: string): boolean {
  if (!url || typeof url !== "string") return true;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return true;
  }
}

/**
 * Returns the app base URL (no trailing slash).
 * - Production: uses NEXTAUTH_URL only if it's not localhost; else VERCEL_URL.
 *   Never uses 127.0.0.1 in production.
 * - Development: uses NEXTAUTH_URL or http://127.0.0.1:3000.
 */
export function getAppBaseUrl(): string {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
    if (nextAuthUrl && !isLocalhostUrl(nextAuthUrl)) {
      return nextAuthUrl.replace(/\/$/, "");
    }
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");
    }
    if (nextAuthUrl && isLocalhostUrl(nextAuthUrl)) {
      console.warn(
        "NEXTAUTH_URL is set to localhost in production; ignoring. Set NEXTAUTH_URL to your production URL (e.g. https://tracklistsocial.com)."
      );
    }
    throw new Error(
      "In production set NEXTAUTH_URL to your site URL (e.g. https://tracklistsocial.com), or deploy on Vercel so VERCEL_URL is set."
    );
  }

  const nextAuthUrl = process.env.NEXTAUTH_URL?.trim();
  if (nextAuthUrl) return nextAuthUrl.replace(/\/$/, "");
  return "http://127.0.0.1:3000";
}
