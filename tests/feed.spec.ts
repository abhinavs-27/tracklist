import { test, expect } from '@playwright/test';

test.describe('Feed', () => {
  test('feed page redirects to sign in or shows feed', async ({ page }) => {
    await page.goto('/feed');
    const isSignIn = await page.getByRole('button', { name: /sign in with google/i }).isVisible();
    const isFeed = await page.getByRole('heading', { name: /feed/i }).isVisible();
    expect(isSignIn || isFeed).toBeTruthy();
  });

  test('feed API requires auth and returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/feed');
    expect(res.status()).toBe(401);
  });

  test('feed API with cursor and limit params returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/feed?limit=10&cursor=2024-01-01T00:00:00.000Z');
    expect(res.status()).toBe(401);
  });

  test('feed API response shape has items and next_cursor when 200', async ({ request }) => {
    const res = await request.get('/api/feed');
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.next_cursor === null || typeof data.next_cursor === 'string').toBe(true);
    if (data.items.length > 1) {
      const times = data.items.map((a: { created_at: string }) => new Date(a.created_at).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    }
  });
});
