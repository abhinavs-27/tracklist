import { test, expect } from '@playwright/test';

test.describe('Discover', () => {
  test('GET /api/discover/trending returns 200 and array', async ({ request }) => {
    const res = await request.get('/api/discover/trending');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toMatchObject({
        entity_id: expect.any(String),
        entity_type: expect.any(String),
        listen_count: expect.any(Number),
      });
    }
  });

  test('GET /api/discover/rising-artists returns 200 and array', async ({ request }) => {
    const res = await request.get('/api/discover/rising-artists');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toMatchObject({
        artist_id: expect.any(String),
        name: expect.any(String),
        growth: expect.any(Number),
      });
      if (data[0].avatar_url != null) {
        expect(typeof data[0].avatar_url).toBe('string');
      }
    }
  });

  test('GET /api/discover/hidden-gems returns 200 and array', async ({ request }) => {
    const res = await request.get('/api/discover/hidden-gems');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    if (data.length > 0) {
      expect(data[0]).toMatchObject({
        entity_id: expect.any(String),
        entity_type: expect.any(String),
        avg_rating: expect.any(Number),
        listen_count: expect.any(Number),
      });
    }
  });

  test('discover API endpoints return empty array when no data', async ({ request }) => {
    const [trending, rising, gems] = await Promise.all([
      request.get('/api/discover/trending'),
      request.get('/api/discover/rising-artists'),
      request.get('/api/discover/hidden-gems'),
    ]);
    expect(trending.status()).toBe(200);
    expect(rising.status()).toBe(200);
    expect(gems.status()).toBe(200);
    expect(Array.isArray(await trending.json())).toBe(true);
    expect(Array.isArray(await rising.json())).toBe(true);
    expect(Array.isArray(await gems.json())).toBe(true);
  });

  test('discover page shows Discover heading and discovery sections', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /discover/i })).toBeVisible();
    const hasTrending = await page.getByRole('heading', { name: /trending/i }).isVisible();
    const hasRising = await page.getByRole('heading', { name: /rising artists/i }).isVisible();
    const hasHidden = await page.getByRole('heading', { name: /hidden gems/i }).isVisible();
    const hasSuggested = await page.getByRole('heading', { name: /suggested users/i }).isVisible();
    const hasRecentlyActive = await page.getByRole('heading', { name: /recently active/i }).isVisible();
    expect(hasTrending || hasRising || hasHidden || hasSuggested || hasRecentlyActive).toBeTruthy();
  });

  test('discover page shows Trending, Rising artists, and Hidden gems sections even when empty', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /trending \(last 24h\)/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /rising artists/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /hidden gems/i })).toBeVisible();
  });

  test('discover page has link to search users', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('link', { name: /search users by username/i })).toBeVisible();
  });

  test('discover trending returns consistent shape from cache or live (cached data matches expected TTL shape)', async ({
    request,
  }) => {
    const res1 = await request.get('/api/discover/trending?limit=5');
    expect(res1.status()).toBe(200);
    const data1 = await res1.json();
    expect(Array.isArray(data1)).toBe(true);
    const res2 = await request.get('/api/discover/trending?limit=5');
    expect(res2.status()).toBe(200);
    const data2 = await res2.json();
    expect(Array.isArray(data2)).toBe(true);
    if (data1.length > 0 && data2.length > 0) {
      expect(data2[0]).toMatchObject({
        entity_id: expect.any(String),
        entity_type: expect.any(String),
        listen_count: expect.any(Number),
      });
    }
  });

  test('discover page renders even when some sections have no data (allSettled prevents blocking)', async ({
    page,
  }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /discover/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /trending \(last 24h\)/i })).toBeVisible();
  });

  test('discover page renders within expected time (deferred sections)', async ({ page }) => {
    const start = Date.now();
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /discover/i })).toBeVisible({ timeout: 10000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(10000);
    await expect(page.getByRole('heading', { name: /trending \(last 24h\)/i })).toBeVisible({ timeout: 5000 });
  });

  test('deferred discover sections: trending links are clickable', async ({ page }) => {
    await page.goto('/discover');
    await expect(page.getByRole('heading', { name: /trending \(last 24h\)/i })).toBeVisible({ timeout: 8000 });
    const songLink = page.locator('a[href^="/song/"]').first();
    if (await songLink.isVisible()) {
      await expect(songLink).toBeEnabled();
    }
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

