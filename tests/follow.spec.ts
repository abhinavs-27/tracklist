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
});
