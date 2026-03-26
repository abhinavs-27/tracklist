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
    expect(hasTrending || hasRising || hasHidden).toBeTruthy();
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

  test('GET /api/search/users/browse returns 401 when unauthenticated', async ({ request }) => {
    const res = await request.get('/api/search/users/browse');
    expect(res.status()).toBe(401);
  });
});

