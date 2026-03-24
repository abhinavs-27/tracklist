/**
 * Same semantics as root `lib/spotify-integration-enabled.ts`.
 */

let devLoggedDisabled = false;

export function isSpotifyCatalogAllowedForLastfmImport(): boolean {
  if (process.env.SPOTIFY_DISABLE_FOR_LASTFM_IMPORT === "true") {
    return false;
  }
  const k = process.env.LASTFM_API_KEY?.trim();
  return Boolean(k && k.length > 0);
}

export function isSpotifyIntegrationEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_SPOTIFY === "true" ||
    process.env.ENABLE_SPOTIFY_INTEGRATION === "true" ||
    process.env.EXPO_PUBLIC_ENABLE_SPOTIFY === "true"
  );
}

export function isSpotifyProfileIntegrationVisible(): boolean {
  if (process.env.NEXT_PUBLIC_HIDE_SPOTIFY_PROFILE === "true") {
    return false;
  }
  return isSpotifyIntegrationEnabled();
}
