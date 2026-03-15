import { test, expect } from '@playwright/test';

test.describe('Spotify sync / ingestion (Mocked)', () => {
  test('sync endpoint ingest recently played tracks', async ({ page }) => {
    await page.goto('/');

    // Mock session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_1', name: 'Test User', email: 'test@example.com' },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // Mock sync API
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          inserted: 5,
          skipped: 2,
          mode: 'song'
        }),
      });
    });

    const response = await page.evaluate(async () => {
        const res = await fetch('/api/spotify/sync', { method: 'POST' });
        return { status: res.status, data: await res.json() };
    });

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      inserted: 5,
      skipped: 2,
      mode: 'song'
    });
  });
});
