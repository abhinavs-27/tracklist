/**
 * Same semantics as root `lib/spotify-integration-enabled.ts` (Express backend may run without Next public env).
 */

export class SpotifyIntegrationDisabledError extends Error {
  constructor(message = "Spotify integration is temporarily disabled") {
    super(message);
    this.name = "SpotifyIntegrationDisabledError";
  }
}

export function isSpotifyIntegrationEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_SPOTIFY === "true" ||
    process.env.ENABLE_SPOTIFY_INTEGRATION === "true" ||
    process.env.EXPO_PUBLIC_ENABLE_SPOTIFY === "true"
  );
}
