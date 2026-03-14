import { test, expect } from '@playwright/test';

test.describe('Discover', () => {
  test('discover page shows Discover heading and Suggested users or Recently active', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /discover/i })).toBeVisible();
    const hasSuggested = await page.getByRole('heading', { name: /suggested users/i }).isVisible();
    const hasRecentlyActive = await page.getByRole('heading', { name: /recently active/i }).isVisible();
    expect(hasSuggested || hasRecentlyActive).toBeTruthy();
  });

  test('discover page has link to search users', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('link', { name: /search users by username/i })).toBeVisible();
  });

  test('follow/unfollow toggles state', async ({ page }) => {
    await page.route('**/api/discover**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
              username: 'alice',
              avatar_url: null,
              latest_album_spotify_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
              latest_log_created_at: new Date().toISOString(),
              is_following: false,
              is_viewer: false,
            },
          ],
        }),
      });
    });

    await page.route('**/api/spotify/album/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: '2nLhD10Z7Sb4RFyCX2ZCyx',
          name: 'Mock Album',
          images: [{ url: 'https://example.com/cover.jpg' }],
          artists: [],
          release_date: null,
        }),
      });
    });

    await page.route('**/api/follow', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
        return;
      }
      await route.fallback();
    });

    await page.route('**/api/follow?following_id=*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
        return;
      }
      await route.fallback();
    });

    await page.goto('/discover');

    const followButton = page.getByRole('button', { name: /^follow$/i });
    await expect(followButton).toBeVisible();
    await followButton.click();

    await expect(page.getByRole('button', { name: /^following$/i })).toBeVisible();
    await page.getByRole('button', { name: /^following$/i }).click();
    await expect(page.getByRole('button', { name: /^follow$/i })).toBeVisible();
  });
});

