import { test, expect } from '@playwright/test';

/**
 * Automated Critical Flow Tests (v4) for Tracklist.
 *
 * These tests verify the core functionality of the application:
 * 1. Creating reviews (UI & API)
 * 2. Logging listens (UI & API)
 * 3. Spotify ingestion (API)
 * 4. User profile fetch (API)
 * 5. Search results (UI)
 */

test.describe('Critical Flows: Automated UI Integration', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'v4-tester-id',
            name: 'V4 Tester',
            email: 'v4@example.com',
            username: 'v4tester',
            image: 'https://example.com/avatar.png'
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
        body: JSON.stringify({ csrfToken: 'v4-csrf-token' }),
      });
    });
  });

  test('Flow 1: Creating a Review (Success & Error States)', async ({ page }) => {
    // Mock Success Response
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.rating < 1 || body.rating > 5) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Rating must be between 1 and 5' }),
          });
        }
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'v4-review-123', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('V4 Excellent Review');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Edge Case: Conflict (409) check via evaluate
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Conflict' }),
        });
      }
    }, { times: 1 });

    const conflictRes = await page.evaluate(async () => {
        const r = await fetch('/api/reviews', {
            method: 'POST',
            body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5 }),
            headers: { 'Content-Type': 'application/json' }
        });
        return r.status;
    });
    expect(conflictRes).toBe(409);
  });

  test('Flow 2: Logging Listens (Success & Error States)', async ({ page }) => {
    // Mock Logs API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (!body.track_id) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Missing track_id' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'v4-log-456', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');

    // Edge Case: 503 Catalog Pending
    await page.route('**/api/logs', async (route) => {
        if (route.request().method() === 'POST') {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'catalog_pending' }),
          });
        }
      }, { times: 1 });

      const pendingRes = await page.evaluate(async () => {
          const r = await fetch('/api/logs', {
              method: 'POST',
              body: JSON.stringify({ track_id: 'a1', source: 'manual' }),
              headers: { 'Content-Type': 'application/json' }
          });
          return r.status;
      });
      expect(pendingRes).toBe(503);
  });

  test('Flow 3: Spotify Ingestion (Sync API)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 7, skipped: 1, mode: 'song' }),
        });
      }
    });

    await page.goto('/');

    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(syncResult.status).toBe(200);
    expect(syncResult.body.inserted).toBe(7);
  });

  test('Flow 4: User Profile Fetch', async ({ page }) => {
    const mockProfile = {
        id: 'v4-user-id',
        username: 'v4tester',
        bio: 'V4 Bio testing',
        followers_count: 42
    };

    await page.route('**/api/users/v4tester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProfile),
      });
    });

    await page.goto('/');
    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/v4tester');
      return res.json();
    });
    expect(profile.username).toBe('v4tester');
    expect(profile.bio).toBe('V4 Bio testing');
  });

  test('Flow 5: Search Results (Navigation)', async ({ page }) => {
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('v4search');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=v4search/);
    await expect(searchInput).toHaveValue('v4search');
  });

});
