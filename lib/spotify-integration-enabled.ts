/**
 * Switch for user-facing Spotify features (OAuth, search UI, ingest, etc.).
 * Last.fm import still works with a username when the server has LASTFM_API_KEY and
 * Spotify client credentials; mapping uses `allowLastfmMapping` on search only.
 * Set NEXT_PUBLIC_ENABLE_SPOTIFY=true (and/or ENABLE_SPOTIFY_INTEGRATION=true on the server) to re-enable.
 * Default: disabled when unset.
 */

export class SpotifyIntegrationDisabledError extends Error {
  constructor(message = "Spotify integration is temporarily disabled") {
    super(message);
    this.name = "SpotifyIntegrationDisabledError";
  }
}

let devLoggedDisabled = false;

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
