/**
 * Expo: EXPO_PUBLIC_ENABLE_SPOTIFY=true — Spotify logging / OAuth in the app.
 * Search uses the server API (client credentials); it does not depend on this flag.
 * Set EXPO_PUBLIC_HIDE_SPOTIFY_PROFILE=true to hide Spotify controls on profile only.
 */

export function isSpotifyIntegrationEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_SPOTIFY === "true";
}

export function isSpotifyProfileIntegrationVisible(): boolean {
  if (process.env.EXPO_PUBLIC_HIDE_SPOTIFY_PROFILE === "true") {
    return false;
  }
  return isSpotifyIntegrationEnabled();
}

export const SPOTIFY_DISABLED_USER_MESSAGE =
  "Spotify logging is not enabled for this app.";
