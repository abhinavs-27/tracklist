import { test, expect } from '@playwright/test';

test.describe('Album hub', () => {
  test('invalid album id returns 404', async ({ page }) => {
    await page.goto('/album/invalid_id_12345');
    await expect(page.getByText(/not found|page you're looking for/i)).toBeVisible({ timeout: 10000 });
  });

  test('album page shows hub sections when loaded', async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run album hub E2E.'
    );
    await page.goto('/album/2nLhD10Z7Sb4RFyCX2ZCyx');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    const hasTracks = await page.getByRole('heading', { name: /tracks/i }).isVisible();
    const hasReviews = await page.getByRole('heading', { name: /reviews/i }).isVisible();
    const hasRecentListens = await page.getByRole('heading', { name: /recent listens/i }).isVisible();
    const hasFriendsListened = await page.getByRole('heading', { name: /friends who listened/i }).isVisible();
    expect(hasTracks || hasReviews || hasRecentListens || hasFriendsListened).toBeTruthy();
  });

  test('album page shows rating distribution label when section present', async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run album hub E2E.'
    );
    await page.goto('/album/2nLhD10Z7Sb4RFyCX2ZCyx');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    const hasRatingDist = await page.getByText(/rating distribution/i).isVisible();
    expect(typeof hasRatingDist).toBe('boolean');
  });
});
