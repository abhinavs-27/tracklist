/**
 * `isSpotifyIntegrationEnabled()` — OAuth, account sync, ingest cron, user-linked Spotify APIs.
 * Use for **user-linked** Spotify flows only (not catalog search/metadata).
 *
 * Manual quick log (`/api/search` + `POST /api/logs`) uses the **catalog** (client credentials)
 * and does **not** require this flag — keep quick log UI enabled whenever search works.
 *
 * To hide Spotify **profile** controls (connect / sync UI) without toggling env flags,
 * set `NEXT_PUBLIC_HIDE_SPOTIFY_PROFILE=true`.
 *
 * Catalog (`spotifyFetch` / client credentials) is not gated by this — it only needs
 * `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`.
 *
 * Last.fm → Spotify ID mapping when `LASTFM_API_KEY` is set — unless
 * `SPOTIFY_DISABLE_FOR_LASTFM_IMPORT=true`.
 */

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
    console.debug("[Spotify user integration off — OAuth / logging]");
  }

  return enabled;
}

/** True when profile should show Spotify connect / sync (manual opt-out via env). */
export function isSpotifyProfileIntegrationVisible(): boolean {
  if (process.env.NEXT_PUBLIC_HIDE_SPOTIFY_PROFILE === "true") {
    return false;
  }
  return isSpotifyIntegrationEnabled();
}

export const SPOTIFY_DISABLED_USER_MESSAGE =
  "Spotify logging is not enabled for this app.";

export const SPOTIFY_DISABLED_API_MESSAGE =
  "Spotify account linking is not enabled.";
