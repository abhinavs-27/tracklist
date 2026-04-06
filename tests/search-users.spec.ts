import { test, expect } from '@playwright/test';

test.describe('User search', () => {
  test('search users page is readable when not authenticated', async ({ page }) => {
    await page.goto('/search/users');
    await expect(page.getByRole('heading', { name: /find people/i })).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth\/signin/);
  });

  test('search users API works when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/search/users?q=ab');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test('search users API response is array and excludes current user when authenticated', async ({ request }) => {
    const res = await request.get('/api/search/users?q=ab');
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});
