import { test, expect } from '@playwright/test';

test.describe('Logging music', () => {
  test('logging CTA renders (via E2E harness)', async ({ page }) => {
    await page.goto('/e2e/logging');
    await expect(page.getByRole('button', { name: /rate.*review/i })).toHaveCount(2);
  });

  test('album page renders when Spotify creds configured', async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run full album page E2E.'
    );

    await page.goto('/album/2nLhD10Z7Sb4RFyCX2ZCyx');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
  });
});
