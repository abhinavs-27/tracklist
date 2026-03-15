import { test, expect } from '@playwright/test';

test.describe('Recommendations', () => {
  test('GET album recommendations returns array', async ({ request }) => {
    const res = await request.get('/api/recommendations/album?album_id=2UJcKSJbAUH7k2qOuc3H3K&limit=10');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.recommendations)).toBe(true);
    for (const rec of data.recommendations) {
      expect(rec).toMatchObject({
        album_id: expect.any(String),
        score: expect.any(Number),
      });
      expect(rec.album_id.length).toBeGreaterThan(0);
      expect(rec.score).toBeGreaterThanOrEqual(0);
    }
  });

  test('Recommended albums do not include the source album', async ({ request }) => {
    const albumId = '2UJcKSJbAUH7k2qOuc3H3K';
    const res = await request.get(`/api/recommendations/album?album_id=${encodeURIComponent(albumId)}&limit=20`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.recommendations)).toBe(true);
    for (const rec of data.recommendations) {
      expect(rec.album_id).not.toBe(albumId);
    }
  });

  test('Results ordered by score DESC', async ({ request }) => {
    const res = await request.get('/api/recommendations/album?album_id=2UJcKSJbAUH7k2qOuc3H3K&limit=20');
    expect(res.status()).toBe(200);
    const data = await res.json();
    const scores = (data.recommendations as { score: number }[]).map((r) => r.score);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  test('Handles empty dataset gracefully', async ({ request }) => {
    const res = await request.get('/api/recommendations/album?album_id=nonexistent_album_12345&limit=10');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.recommendations)).toBe(true);
    expect(data.recommendations.length).toBe(0);
  });

  test('Album recommendations without album_id returns 400', async ({ request }) => {
    const res = await request.get('/api/recommendations/album?limit=10');
    expect(res.status()).toBe(400);
  });

  test('Personalized recommendations require auth', async ({ request }) => {
    const res = await request.get('/api/recommendations/user');
    expect(res.status()).toBe(401);
  });

  test('Personalized recommendations return array when authenticated', async ({ request }) => {
    const res = await request.get('/api/recommendations/user');
    if (res.status() === 401) {
      test.skip();
      return;
    }
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.recommendations)).toBe(true);
    for (const rec of data.recommendations) {
      expect(rec).toMatchObject({
        album_id: expect.any(String),
        score: expect.any(Number),
      });
    }
  });

  test('Discover recommended page shows section or empty state', async ({ page }) => {
    await page.goto('/discover/recommended');
    const signIn = page.getByRole('button', { name: /sign in/i });
    if (await signIn.isVisible()) {
      test.skip();
      return;
    }
    await expect(page.getByRole('heading', { name: /recommended for you/i })).toBeVisible();
    const grid = page.locator('a[href^="/album/"]');
    const recommendedText = page.getByText(/albums loved by people with similar taste/i);
    await expect(recommendedText).toBeVisible();
  });
});
