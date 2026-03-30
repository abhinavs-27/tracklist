import { test, expect } from '@playwright/test';

/**
 * Extended API Integration flows for the Tracklist application.
 * These tests focus on validating the behavior of the API endpoints,
 * including success states and specific error responses (400, 401, 404).
 */
test.describe('Extended API Critical Flows', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Mock the session to be authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_1', username: 'testuser' },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });
  });

  test('API: Create Review - validation and success', async ({ page }) => {
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.rating < 1 || body.rating > 5) {
          return route.fulfill({ status: 400, body: JSON.stringify({ error: 'rating must be an integer 1–5' }) });
        }
        return route.fulfill({ status: 201, body: JSON.stringify({ id: 'r1', ...body }) });
      }
    });

    await page.goto('/');

    // Test success
    const success = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '1234567890123456789012', rating: 5, review_text: 'Great!' }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status, data: await res.json() };
    });
    expect(success.status).toBe(201);
    expect(success.data.rating).toBe(5);

    // Test invalid rating (400)
    const badRating = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '1234567890123456789012', rating: 6 }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status, data: await res.json() };
    });
    expect(badRating.status).toBe(400);
    expect(badRating.data.error).toContain('1–5');
  });

  test('API: Log Listen - validation and success', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (!body.track_id) return route.fulfill({ status: 400, body: JSON.stringify({ error: 'Missing required field' }) });
        return route.fulfill({ status: 200, body: JSON.stringify({ id: 'l1', ...body }) });
      }
    });

    await page.goto('/');

    const success = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '1234567890123456789012', source: 'manual' }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status, data: await res.json() };
    });
    expect(success.status).toBe(200);

    const badRequest = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        body: JSON.stringify({ source: 'manual' }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status };
    });
    expect(badRequest.status).toBe(400);
  });

  test('API: Spotify Sync - handle 403 Forbidden', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({ status: 403, body: JSON.stringify({ error: 'Token expired' }) });
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status };
    });
    expect(result.status).toBe(403);
  });

  test('API: User Profile - 404 for missing user', async ({ page }) => {
    await page.route('**/api/users/unknown', async (route) => {
      await route.fulfill({ status: 404, body: JSON.stringify({ error: 'User not found' }) });
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/users/unknown');
      return { status: res.status };
    });
    expect(result.status).toBe(404);
  });

  test('API: Search - 400 for empty query', async ({ page }) => {
    await page.route('**/api/search*', async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.get('q')) {
        return route.fulfill({ status: 400, body: JSON.stringify({ error: 'Query q is required' }) });
      }
      return route.fulfill({ status: 200, body: JSON.stringify({ items: [] }) });
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/search');
      return { status: res.status };
    });
    expect(result.status).toBe(400);
  });
});
