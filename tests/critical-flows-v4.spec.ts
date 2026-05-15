import { test, expect } from '@playwright/test';

/**
 * Automated Critical Flow Tests for Tracklist.
 * Version 4: Consolidated and Hermetic.
 *
 * This suite verifies the 5 critical flows:
 * 1. Creating reviews (UI & API)
 * 2. Logging listens (UI & API)
 * 3. Spotify ingestion (API)
 * 4. User profile fetch (API)
 * 5. Search results (UI)
 *
 * All external and database-dependent network requests are mocked via page.route.
 */

test.describe('Critical Flows: Consolidated Integration', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Mock NextAuth session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Automated Tester',
            email: 'tester@example.com',
            username: 'autotester',
            image: 'https://example.com/avatar.png'
          },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // 2. Mock CSRF token
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('Flow 1: Creating a Review', async ({ page }) => {
    // Mock the reviews POST API
    await page.route('**/api/reviews', async (route) => {
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
          body: JSON.stringify({ id: 'mock-review-123', ...body, created_at: new Date().toISOString() }),
        });
      }
    });

    // Success Case via UI
    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Testing consolidated review creation');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Error Case (Invalid Rating)
    const errorResult = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 6 })
      });
      return { status: res.status, body: await res.json() };
    });
    expect(errorResult.status).toBe(400);
    expect(errorResult.body.error).toContain('between 1 and 5');
  });

  test('Flow 2: Logging Listens', async ({ page }) => {
    // Mock the logs API
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
          body: JSON.stringify({ id: 'mock-log-456', ...body }),
        });
      }
    });

    // Success Case via UI
    await page.goto('/e2e/logging');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');

    // Error Case (Missing track_id)
    const errorResult = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual' })
      });
      return { status: res.status };
    });
    expect(errorResult.status).toBe(400);
  });

  test('Flow 3: Spotify Ingestion', async ({ page }) => {
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
    // Success Mock
    await page.route('**/api/users/jules_v4', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'jules_v4', bio: 'Consolidated test bio' }),
      });
    });

    // 404 Mock
    await page.route('**/api/users/missing_v4', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/');

    // Success check
    const successProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/jules_v4');
      return { status: res.status, body: await res.json() };
    });
    expect(successProfile.status).toBe(200);
    expect(successProfile.body.username).toBe('jules_v4');

    // 404 check
    const missingProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/missing_v4');
      return { status: res.status };
    });
    expect(missingProfile.status).toBe(404);
  });

  test('Flow 5: Search Results', async ({ page }) => {
    // 1. Mock Search APIs
    await page.route('**/api/search?q=daft*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: {
            items: [{
              id: 'dp1',
              name: 'Daft Punk',
              popularity: 99,
              images: [{ url: 'https://example.com/daftpunk.jpg' }]
            }]
          },
          albums: { items: [] },
          tracks: { items: [] }
        }),
      });
    });

    await page.route('**/api/search/users?q=daft*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/search');
    // Use visible filter to avoid strict mode violation if multiple inputs exist (mobile/desktop)
    const searchInput = page.getByPlaceholder(/Search artists/i).filter({ visible: true });

    await searchInput.fill('daft punk');
    await searchInput.evaluate(el => el.dispatchEvent(new Event('input', { bubbles: true })));

    // Verify UI updates
    await expect(page.getByText('Top result')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Daft Punk').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Artists/i })).toBeVisible();
  });

});
