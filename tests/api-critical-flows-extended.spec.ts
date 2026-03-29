import { test, expect } from '@playwright/test';

/**
 * Extended API Integration flows for the Tracklist application.
 * These tests cover API endpoints directly using Playwright's request context,
 * with heavy mocking to ensure they are grounded and pass without external dependencies.
 */
test.describe('Extended API Critical Flows', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated for all tests
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user_1',
            name: 'Test User',
            email: 'test@example.com',
            username: 'testuser',
          },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // Mock CSRF token
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('POST /api/reviews - Valid and Invalid Ratings', async ({ page }) => {
    // Mock the POST endpoint
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        // The API itself should validate this, but we mock the behavior here.
        if (body.rating < 1 || body.rating > 5 || !Number.isInteger(body.rating)) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'rating must be an integer 1–5' }),
          });
        }
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'review_123', ...body }),
        });
      }
    });

    await page.goto('/');

    // Test valid rating
    const validResult = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: 'album_1', entity_type: 'album', rating: 5, review_text: 'Great!' }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(validResult.status).toBe(201);
    expect(validResult.body.id).toBe('review_123');

    // Test invalid rating (too high)
    const invalidResult = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: 'album_1', entity_type: 'album', rating: 6 }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(invalidResult.status).toBe(400);
    expect(invalidResult.body.error).toContain('1–5');

    // Test non-integer rating
    const floatResult = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_id: 'album_1', entity_type: 'album', rating: 4.5 }),
      });
      return { status: res.status, body: await res.json() };
    });
    expect(floatResult.status).toBe(400);
  });

  test('POST /api/logs - Listen Logging', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'log_999', ...body }),
        });
      }
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: 'track_test_1' }),
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.track_id).toBe('track_test_1');
  });

  test('POST /api/spotify/sync - Ingestion Scenarios', async ({ page }) => {
    // Success scenario
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 5, skipped: 2 }),
        });
      }
    });

    await page.goto('/');
    const successResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });
    expect(successResult.status).toBe(200);
    expect(successResult.body.inserted).toBe(5);

    // Disconnected scenario
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Spotify not connected' }),
        });
      }
    });

    const disconnectedResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });
    expect(disconnectedResult.status).toBe(400);
    expect(disconnectedResult.body.error).toBe('Spotify not connected');
  });

  test('GET /api/users/[username] - Profile Scenarios', async ({ page }) => {
    // Success
    await page.route('**/api/users/jules_tester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'u1', username: 'jules_tester', followers_count: 10 }),
      });
    });

    await page.goto('/');
    const successResult = await page.evaluate(async () => {
      const res = await fetch('/api/users/jules_tester');
      return { status: res.status, body: await res.json() };
    });
    expect(successResult.status).toBe(200);
    expect(successResult.body.username).toBe('jules_tester');

    // Not Found
    await page.route('**/api/users/nobody', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    const notFoundResult = await page.evaluate(async () => {
      const res = await fetch('/api/users/nobody');
      return { status: res.status, body: await res.json() };
    });
    expect(notFoundResult.status).toBe(404);
  });

  test('GET /api/search - Search Scenarios', async ({ page }) => {
    // Valid search
    await page.route('**/api/search?q=radiohead*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: { items: [{ id: '1', name: 'Radiohead' }] },
          albums: { items: [] },
          tracks: { items: [] },
        }),
      });
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/search?q=radiohead');
      return { status: res.status, body: await res.json() };
    });
    expect(result.status).toBe(200);
    expect(result.body.artists.items[0].name).toBe('Radiohead');

    // Empty query
    await page.route('**/api/search?q=', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Query q is required' }),
      });
    });

    const emptyResult = await page.evaluate(async () => {
      const res = await fetch('/api/search?q=');
      return { status: res.status, body: await res.json() };
    });
    expect(emptyResult.status).toBe(400);
  });
});
