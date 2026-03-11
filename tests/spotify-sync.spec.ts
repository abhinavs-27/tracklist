import { test } from '@playwright/test';

test.describe('Spotify sync / automatic logging (stubs)', () => {
  test('stub: callback stores tokens for the authenticated user only', async () => {
    test.skip(
      true,
      [
        'TODO: Implement a mocked end-to-end test for `/api/spotify/callback`.',
        '- Use `page.route` to intercept the call from Spotify back to `/api/spotify/callback?code=...&state=...`.',
        '- Mock `exchangeSpotifyCode` (via route interception or test-only flag) to return an access_token, refresh_token, and expires_in.',
        '- Assert that the app calls Supabase `spotify_tokens.upsert` with the signed-in user_id and never exposes refresh_token to the client.',
        '- Verify that the user is redirected back to the `returnTo` path and that state/return_to cookies are cleared.',
      ].join('\n')
    );
  });

  test('stub: recently-played sync creates logs and dedupes per (type, spotify_id)', async () => {
    test.skip(
      true,
      [
        'TODO: Implement `/api/spotify/sync` behavior test with mocked Spotify + Supabase.',
        '- Mock `spotify_tokens` fetch to return a valid access_token/refresh_token pair.',
        '- Mock `getRecentlyPlayed` to return a mix of album + track plays with duplicates.',
        '- Mock Supabase `logs` select/insert so no real DB writes occur.',
        '- Assert that new logs are inserted only once per (type, spotify_id) and that existing logs are skipped.',
      ].join('\n')
    );
  });

  test('stub: token refresh path handles expired tokens gracefully', async () => {
    test.skip(
      true,
      [
        'TODO: Test the expired-token branch in `/api/spotify/sync`.',
        '- Arrange `spotify_tokens.expires_at` to be in the past.',
        '- Mock `refreshSpotifyAccessToken` to return a new access_token (and optionally new refresh_token).',
        '- Assert that `/api/spotify/sync` updates the row in `spotify_tokens` and then calls `getRecentlyPlayed` with the new access_token.',
        '- Also add a variant where refresh fails (non-200) and ensure the route returns a 500 JSON error without touching logs.',
      ].join('\n')
    );
  });
});

