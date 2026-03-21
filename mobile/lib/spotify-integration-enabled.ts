/**
 * Expo: EXPO_PUBLIC_ENABLE_SPOTIFY=true to re-enable Spotify-backed features.
 */

export function isSpotifyIntegrationEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_SPOTIFY === "true";
}

export const SPOTIFY_DISABLED_USER_MESSAGE =
  "Music import and Spotify features are temporarily unavailable.";
