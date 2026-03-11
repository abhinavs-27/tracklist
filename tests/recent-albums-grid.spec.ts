import { test, expect } from '@playwright/test';

test.describe('RecentAlbumsGrid rendering', () => {
  test('renders album tiles from logs and Spotify album lookups', async ({ page }) => {
    await page.route('**/api/logs?user_id=*&limit=*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'log_1',
            user_id: 'user_demo_1',
            spotify_id: 'album_spotify_1',
            type: 'album',
            title: 'Album One',
            rating: 5,
            review: null,
            listened_at: new Date('2026-02-01T00:00:00.000Z').toISOString(),
            created_at: new Date('2026-02-02T00:00:00.000Z').toISOString(),
          },
          {
            id: 'log_2',
            user_id: 'user_demo_1',
            spotify_id: 'album_spotify_2',
            type: 'album',
            title: 'Album Two',
            rating: 3,
            review: null,
            listened_at: new Date('2026-02-03T00:00:00.000Z').toISOString(),
            created_at: new Date('2026-02-04T00:00:00.000Z').toISOString(),
          },
        ]),
      });
    });

    await page.route('**/api/spotify/album/album_spotify_1', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'album_spotify_1',
          name: 'Mock Album One',
          images: [{ url: 'https://example.com/cover1.jpg' }],
        }),
      });
    });

    await page.route('**/api/spotify/album/album_spotify_2', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'album_spotify_2',
          name: 'Mock Album Two',
          images: [{ url: 'https://example.com/cover2.jpg' }],
        }),
      });
    });

    await page.goto('/e2e/recent-albums');

    await expect(page.getByRole('heading', { name: /recent albums/i })).toBeVisible();

    // Tiles are Links with aria-labels including stars.
    await expect(page.getByRole('link', { name: /mock album one/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /mock album two/i })).toBeVisible();
  });
});

