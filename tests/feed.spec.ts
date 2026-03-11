import { test, expect } from '@playwright/test';

test.describe('Feed', () => {
  test('feed page redirects to sign in or shows feed', async ({ page }) => {
    await page.goto('/feed');
    const isSignIn = await page.getByRole('button', { name: /sign in with google/i }).isVisible();
    const isFeed = await page.getByRole('heading', { name: /feed/i }).isVisible();
    expect(isSignIn || isFeed).toBeTruthy();
  });
});
