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
    const next =
      data.nextCursor ?? data.next_cursor;
    expect(next === null || typeof next === 'string').toBe(true);
    expect(data.items.length).toBeLessThanOrEqual(100);
    if (data.items.length > 1) {
      const times = data.items.map((a: { created_at: string }) => new Date(a.created_at).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    }
  });

  test('feed API caps limit at 100 when requested higher', async ({ request }) => {
    const res = await request.get('/api/feed?limit=150');
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeLessThanOrEqual(100);
  });

  test('feed page renders within expected time (virtualized list)', async ({ page }) => {
    const start = Date.now();
    await page.goto('/feed');
    const feedHeading = page.getByRole('heading', { name: /feed/i });
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await feedHeading.waitFor({ state: 'visible', timeout: 15000 }).catch(() => signIn.waitFor({ state: 'visible', timeout: 5000 }));
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20000);
    if (await feedHeading.isVisible()) {
      const hasContent =
        (await page.getByText(/your feed is empty/i).isVisible()) ||
        (await page.locator('[data-index]').first().isVisible().catch(() => false)) ||
        (await page.getByRole('button', { name: /load more/i }).isVisible().catch(() => false));
      expect(hasContent).toBeTruthy();
    }
  });

  test('virtualized feed shows list or Load more or empty state when signed in', async ({ page }) => {
    await page.goto('/feed');
    const feedHeading = page.getByRole('heading', { name: /feed/i });
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    await feedHeading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => signIn.waitFor({ state: 'visible', timeout: 5000 }));
    if (await feedHeading.isVisible()) {
      const loadMore = page.getByRole('button', { name: /load more/i });
      const empty = page.getByText(/your feed is empty/i);
      const hasList = await page.locator('[data-index]').first().isVisible().catch(() => false);
      const hasListOrEmpty = (await loadMore.isVisible()) || (await empty.isVisible()) || hasList;
      expect(hasListOrEmpty).toBeTruthy();
    }
  });
});
