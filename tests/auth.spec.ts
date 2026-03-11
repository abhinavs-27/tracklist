import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('sign in page loads and shows Google sign in', async ({ page }) => {
    await page.goto('/auth/signin');
    await expect(page.getByRole('heading', { name: /welcome/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in with google/i })).toBeVisible();
  });

  test('home page shows sign in CTA when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: /sign in with google/i })).toBeVisible();
  });

  test('feed redirects to sign in when not authenticated', async ({ page }) => {
    await page.goto('/feed');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });
});
