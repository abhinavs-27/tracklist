import { test, expect } from '@playwright/test';

type LogPostBody = {
  spotify_id?: string;
  type?: 'album' | 'song';
  title?: string;
  rating?: number;
  review?: string | null;
  listened_at?: string;
};

test.describe('Logging albums/tracks (modal)', () => {
  test('album log modal submits to /api/logs', async ({ page }) => {
    // Prevent a full reload after success (the component reloads the page).
    await page.addInitScript(() => {
      window.location.reload = () => {};
    });

    await page.route('**/api/logs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON?.() as LogPostBody | undefined;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'log_created_1',
          user_id: 'user_demo_1',
          spotify_id: body?.spotify_id ?? '2nLhD10Z7Sb4RFyCX2ZCyx',
          type: body?.type ?? 'album',
          title: body?.title ?? 'Demo Album',
          rating: body?.rating ?? 3,
          review: body?.review ?? null,
          listened_at: body?.listened_at ?? new Date().toISOString(),
          created_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto('/e2e/logging');

    await page.getByRole('button', { name: /^log listen$/i }).first().click();
    await expect(page.getByRole('heading', { name: /^log listen$/i })).toBeVisible();

    await page.getByRole('button', { name: /5 stars?/i }).click();
    await page.getByRole('button', { name: /^save log$/i }).click();

    const req = await page.waitForRequest((r) => r.url().includes('/api/logs') && r.method() === 'POST');
    const posted = req.postDataJSON() as LogPostBody;
    expect(posted.type).toBe('album');
    expect(posted.spotify_id).toBe('2nLhD10Z7Sb4RFyCX2ZCyx');
    expect(posted.rating).toBe(5);
  });

  test('track log modal submits to /api/logs', async ({ page }) => {
    await page.addInitScript(() => {
      window.location.reload = () => {};
    });

    await page.route('**/api/logs', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'log_created_2' }),
      });
    });

    await page.goto('/e2e/logging');

    // Second button is the track button on this page.
    await page.getByRole('button', { name: /^log listen$/i }).nth(1).click();
    await expect(page.getByText(/demo track/i)).toBeVisible();

    await page.getByRole('button', { name: /4 stars?/i }).click();
    await page.getByRole('button', { name: /^save log$/i }).click();

    const req = await page.waitForRequest((r) => r.url().includes('/api/logs') && r.method() === 'POST');
    const posted = req.postDataJSON() as LogPostBody;
    expect(posted.type).toBe('song');
    expect(posted.spotify_id).toBe('track_demo_1');
    expect(posted.rating).toBe(4);
  });
});

