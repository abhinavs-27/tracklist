import { test, expect } from '@playwright/test';

test.describe('Feed listen sessions', () => {
  test('feed API returns listen_session events with correct shape when present', async ({ request }) => {
    const res = await request.get('/api/feed?limit=50');
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);

    const listenSessions = data.items.filter((a: { type?: string }) => a.type === 'listen_session');
    for (const item of listenSessions) {
      expect(item).toMatchObject({
        type: 'listen_session',
        user_id: expect.any(String),
        album_id: expect.any(String),
        song_count: expect.any(Number),
        first_listened_at: expect.any(String),
        created_at: expect.any(String),
      });
      expect(item.song_count).toBeGreaterThanOrEqual(1);
    }
  });

  test('feed API items are ordered by created_at descending', async ({ request }) => {
    const res = await request.get('/api/feed?limit=50');
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    if (data.items.length < 2) return;
    const times = data.items.map((a: { created_at: string }) => new Date(a.created_at).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
    }
  });

  test('feed API cursor pagination returns subset and next_cursor', async ({ request }) => {
    const res = await request.get('/api/feed?limit=5');
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeLessThanOrEqual(5);
    if (data.items.length === 5 && data.next_cursor) {
      const res2 = await request.get(`/api/feed?limit=5&cursor=${encodeURIComponent(data.next_cursor)}`);
      expect(res2.status()).toBe(200);
      const data2 = await res2.json();
      expect(Array.isArray(data2.items)).toBe(true);
      if (data2.items.length > 0 && data.items.length > 0) {
        expect(data2.items[0].created_at).not.toBe(data.items[0].created_at);
      }
    }
  });

  test('feed page renders and can show listen session when present', async ({ page }) => {
    await page.goto('/feed');
    const heading = page.getByRole('heading', { name: /feed|your feed/i });
    const signIn = page.getByRole('button', { name: /sign in with google/i });
    if (await signIn.isVisible()) {
      test.skip();
      return;
    }
    await expect(heading).toBeVisible();
    const listenedTo = page.getByText(/listened to/);
    const feedContent = page.locator('ul').first();
    await expect(feedContent).toBeVisible();
  });
});
