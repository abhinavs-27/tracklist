/**
 * Switch for **user-facing** Spotify features (OAuth, search UI, in-app Spotify ingest, etc.).
 *
 * Server-side **catalog/metadata** calls (client credentials) may still run when:
 * - `allowLastfmMapping` / `allowClientCredentials` is passed to `spotifyFetch`, or
 * - `LASTFM_API_KEY` is set (Last.fm import needs Spotify to resolve IDs) — unless
 *   `SPOTIFY_DISABLE_FOR_LASTFM_IMPORT=true` opts out.
 *
 * Set NEXT_PUBLIC_ENABLE_SPOTIFY=true (and/or ENABLE_SPOTIFY_INTEGRATION=true) to enable the full integration.
 */

export class SpotifyIntegrationDisabledError extends Error {
  constructor(message = "Spotify integration is temporarily disabled") {
    super(message);
    this.name = "SpotifyIntegrationDisabledError";
  }
}

let devLoggedDisabled = false;

/** True when Last.fm import is configured; allows Spotify API for catalog mapping unless explicitly blocked. */
export function isSpotifyCatalogAllowedForLastfmImport(): boolean {
  if (process.env.SPOTIFY_DISABLE_FOR_LASTFM_IMPORT === "true") {
    return false;
  }
  const k = process.env.LASTFM_API_KEY?.trim();
  return Boolean(k && k.length > 0);
}

export function isSpotifyIntegrationEnabled(): boolean {
  const enabled =
    process.env.NEXT_PUBLIC_ENABLE_SPOTIFY === "true" ||
    process.env.ENABLE_SPOTIFY_INTEGRATION === "true" ||
    process.env.EXPO_PUBLIC_ENABLE_SPOTIFY === "true";

  if (
    !enabled &&
    process.env.NODE_ENV === "development" &&
    !devLoggedDisabled
  ) {
    devLoggedDisabled = true;
    console.debug("[Spotify Integration Disabled]");
  }

  return enabled;
}

export const SPOTIFY_DISABLED_USER_MESSAGE =
  "Music import and Spotify features are temporarily unavailable.";

export const SPOTIFY_DISABLED_API_MESSAGE =
  "Spotify integration is temporarily disabled.";
