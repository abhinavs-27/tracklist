import { test, expect } from '@playwright/test';
import type { ListenLog } from '@/types';

test.describe('Spotify integration (mocked)', () => {
  test('connect status + manual sync refreshes recent albums grid', async ({ page }) => {
    const username = process.env.PLAYWRIGHT_TEST_PROFILE_USERNAME;
    test.skip(!username, 'Set PLAYWRIGHT_TEST_PROFILE_USERNAME to an existing username to run this test.');

    // Start as not connected.
    let connected = false;

    await page.route('**/api/spotify/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ connected }),
      });
    });

    // Mock sync: flips connection and returns inserted.
    await page.route('**/api/spotify/sync**', async (route) => {
      connected = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inserted: 2, skipped: 0, mode: 'album' }),
      });
    });

    // Logs endpoint is used by RecentAlbumsGrid; return no albums first, then after sync return 2 album logs.
    let logsCall = 0;
    await page.route('**/api/logs?user_id=*&limit=50', async (route) => {
      logsCall += 1;
      const empty: ListenLog[] = [];
      const after: ListenLog[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          spotify_song_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
          played_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        {
          id: '22222222-2222-2222-2222-222222222222',
          user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          spotify_song_id: '6ZG5lRT77aJ3btmArcykra',
          played_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
      ];

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(logsCall <= 1 ? empty : after),
      });
    });

    // Mock Spotify album metadata for the two albums.
    await page.route('**/api/spotify/album/**', async (route) => {
      const url = route.request().url();
      const id = url.split('/').pop() || '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id,
          name: `Album ${id.slice(0, 4)}`,
          images: [{ url: 'https://example.com/cover.jpg' }],
          artists: [],
          release_date: null,
        }),
      });
    });

    await page.goto(`/profile/${username}`);

    // Spotify card should show Not connected (mocked).
    await expect(page.getByText(/status:\s*not connected/i)).toBeVisible();

    // Sync button should be disabled when not connected.
    await expect(page.getByRole('button', { name: /sync recently played/i })).toBeDisabled();

    // Simulate "Connected" by flipping status and reloading status via page reload (simple deterministic test).
    connected = true;
    await page.reload();

    await expect(page.getByText(/status:\s*connected/i)).toBeVisible();
    const syncButton = page.getByRole('button', { name: /sync recently played/i });
    await expect(syncButton).toBeEnabled();

    // Clicking sync should trigger refreshKey -> RecentAlbumsGrid refetch logs.
    await syncButton.click();

    // Grid should now contain links to the album pages.
    await expect(page.getByRole('link', { name: /album/i }).first().or(page.locator('a[href^="/album/"]'))).toBeVisible();
    await expect(page.locator('a[href="/album/2nLhD10Z7Sb4RFyCX2ZCyx"]')).toBeVisible();
    await expect(page.locator('a[href="/album/6ZG5lRT77aJ3btmArcykra"]')).toBeVisible();
  });
});

