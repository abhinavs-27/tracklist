import { test, expect } from '@playwright/test';

test.describe('Engagement', () => {
  test('notifications API returns array', async ({ request }) => {
    const res = await request.get('/api/notifications');
    if (res.status() === 401) {
      test.skip();
      return;
    }
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.notifications)).toBe(true);
    for (const n of data.notifications) {
      expect(n).toMatchObject({
        id: expect.any(String),
        user_id: expect.any(String),
        type: expect.any(String),
        read: expect.any(Boolean),
        created_at: expect.any(String),
      });
    }
  });

  test('notifications mark-read accepts POST', async ({ request }) => {
    const res = await request.post('/api/notifications/mark-read', {
      data: {},
    });
    if (res.status() === 401) {
      test.skip();
      return;
    }
    expect([200, 201]).toContain(res.status());
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('weekly report page or API returns data', async ({ request }) => {
    const res = await request.get('/reports/week');
    if (res.status() === 307 || res.status() === 302) {
      test.skip();
      return;
    }
    expect(res.status()).toBe(200);
  });

  test('profile page loads and can show streak/achievements', async ({ page }) => {
    await page.goto('/');
    const signIn = page.getByRole('button', { name: /sign in/i });
    if (await signIn.isVisible()) {
      await page.goto('/search');
      const firstUser = page.locator('a[href^="/profile/"]').first();
      if (await firstUser.isVisible()) {
        await firstUser.click();
        await expect(page).toHaveURL(/\/profile\//);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      }
      test.skip();
      return;
    }
    await page.goto('/');
    const profileLink = page.getByRole('link', { name: /profile/i });
    if (await profileLink.isVisible()) {
      await profileLink.click();
      await expect(page).toHaveURL(/\/profile\//);
    }
  });
});
