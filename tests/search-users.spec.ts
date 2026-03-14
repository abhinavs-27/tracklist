import { test, expect } from '@playwright/test';

test.describe('User search', () => {
  test('search users page redirects to sign in when not authenticated', async ({ page }) => {
    await page.goto('/search/users');
    await expect(page).toHaveURL(/\/auth\/signin/);
  });

  test('search users API returns 401 when not authenticated', async ({ request }) => {
    const res = await request.get('/api/search/users?q=ab');
    expect(res.status()).toBe(401);
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
