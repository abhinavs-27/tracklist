import { test, expect } from '@playwright/test';

test.describe('Profile and follow', () => {
  test('profile route for unknown user shows not found', async ({ page }) => {
    await page.goto('/profile/__nonexistent_user_12345__');
    await expect(page.getByText(/not found|page you're looking for/i)).toBeVisible({ timeout: 10000 });
  });

  test('navbar has profile link when applicable', async ({ page }) => {
    await page.goto('/');
    const profileOrSignIn = page.getByRole('link', { name: /profile|sign in/i });
    await expect(profileOrSignIn.first()).toBeVisible();
  });

  test('profile page shows Recent activity section when profile exists', async ({ page }) => {
    await page.goto('/profile/alice');
    const notFound = await page.getByText(/not found|page you're looking for/i).isVisible();
    if (notFound) {
      test.skip();
      return;
    }
    await expect(page.getByRole('heading', { name: /recent activity/i })).toBeVisible();
    const hasEmptyState = await page.getByText(/no recent activity yet/i).isVisible();
    const hasList = await page.locator('ul').filter({ has: page.locator('li') }).first().isVisible();
    expect(hasEmptyState || hasList).toBeTruthy();
  });
});
