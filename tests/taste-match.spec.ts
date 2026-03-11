import { test, expect } from '@playwright/test';

test.describe('Taste match', () => {
  test('clicking button renders taste score', async ({ page }) => {
    // Mock the taste-match API since it’s called client-side.
    await page.route('**/api/taste-match**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          score: 42,
          sharedAlbumCount: 3,
          sharedAlbums: [
            { spotify_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating_userA: 5, rating_userB: 4 },
            { spotify_id: '6ZG5lRT77aJ3btmArcykra', rating_userA: 4, rating_userB: 4 },
            { spotify_id: '0sNOF9WDwhWunNAHPD3Baj', rating_userA: 3, rating_userB: 5 },
          ],
        }),
      });
    });

    // Visit an existing profile in your environment.
    // Provide PLAYWRIGHT_TEST_PROFILE_USERNAME to match a real user in your Supabase data.
    const username = process.env.PLAYWRIGHT_TEST_PROFILE_USERNAME;
    test.skip(!username, 'Set PLAYWRIGHT_TEST_PROFILE_USERNAME to an existing username to run this test.');
    await page.goto(`/profile/${username}`);

    // If not signed in, the UI shows an input for userA UUID.
    const userAInput = page.getByLabel('User A id');
    if (await userAInput.isVisible()) {
      await userAInput.fill('11111111-1111-1111-1111-111111111111');
    }

    await page.getByRole('button', { name: /check taste match/i }).click();

    await expect(page.getByTestId('taste-score')).toHaveText('42%');
  });
});

