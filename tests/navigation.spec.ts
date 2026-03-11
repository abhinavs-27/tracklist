import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navbar has Tracklist brand and links', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /tracklist/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /feed/i })).toBeVisible();
  });

  test('artist page loads for valid id', async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run full artist page E2E.'
    );
    await page.goto('/artist/4Z8W4fKeB5YxbusRsdQVPb'); // Radiohead
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
  });

  test('album page loads for valid id', async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run full album page E2E.'
    );
    await page.goto('/album/2nLhD10Z7Sb4RFyCX2ZCyx');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
  });
});
