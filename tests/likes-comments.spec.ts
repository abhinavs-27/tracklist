import { test, expect } from '@playwright/test';

// High-level smoke tests for likes/comments UI using the /e2e/social harness.

test.describe('Likes and comments', () => {
  test('home shows feed or CTA', async ({ page }) => {
    await page.goto('/');
    const hasFeed = await page.getByRole('heading', { name: /your feed|feed/i }).isVisible();
    const hasCTA = await page.getByRole('link', { name: /sign in with google/i }).isVisible();
    expect(hasFeed || hasCTA).toBeTruthy();
  });

  test('E2E social harness renders log card and comment button', async ({ page }) => {
    await page.goto('/e2e/social');
    await expect(page.getByRole('heading', { name: /e2e social/i })).toBeVisible();
    // We don't rely on DB or auth here; just check the harness log + comment trigger exist.
    await expect(page.getByText(/demo album/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /💬/ })).toBeVisible();
  });
});

