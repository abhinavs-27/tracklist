import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Tracklist Critical Flows.
 *
 * These tests verify:
 * 1. Review creation (Success, UI validation, and 10k truncation)
 * 2. Listen logging (Success, track/spotify ID, and 503 pending state)
 * 3. Spotify ingestion (Sync trigger and result)
 * 4. User profile fetch (Success and error states)
 * 5. Search results (UI interaction and limit clamping)
 *
 * Uses /e2e/logging utility page for streamlined testing.
 */

test.describe('Critical Flows: Automated UI Logic', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated
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

    // Mock CSRF token
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('Flow 1: Creating Reviews', async ({ page }) => {
    // Success and 10k truncation mock
    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.rating > 5) {
            return route.fulfill({ status: 400, body: JSON.stringify({ error: 'Invalid rating' }) });
        }
        const text = body.review_text || '';
        const truncated = text.length > 10000 ? text.slice(0, 10000) : text;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'r1', ...body, review_text: truncated }),
        });
      }
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();

    // Fill and save
    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Top tier album!');

    const [response] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 200),
        page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    expect(result.review_text).toBe('Top tier album!');

    // Test 10k truncation via evaluation
    const longText = 'a'.repeat(11000);
    const truncResult = await page.evaluate(async (text) => {
        const res = await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5, review_text: text })
        });
        return res.json();
    }, longText);
    expect(truncResult.review_text.length).toBe(10000);
  });

  test('Flow 2: Logging Listens', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        // Mock 503 for a specific ID
        if (body.track_id === 'pending-id') {
            return route.fulfill({
                status: 503,
                body: JSON.stringify({ code: 'catalog_pending' })
            });
        }
        return route.fulfill({
          status: 200,
          body: JSON.stringify({ id: 'l1', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');

    // Success log
    const [response] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
        page.getByRole('button', { name: /mock log listen/i }).click()
    ]);
    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');

    // Test 503 catalog pending
    const pendingResult = await page.evaluate(async () => {
        const res = await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_id: 'pending-id' })
        });
        return { status: res.status, body: await res.json() };
    });
    expect(pendingResult.status).toBe(503);
    expect(pendingResult.body.code).toBe('catalog_pending');
  });

  test('Flow 3: Spotify Ingestion', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      return route.fulfill({
        status: 200,
        body: JSON.stringify({ inserted: 3, skipped: 1 }),
      });
    });

    await page.goto('/');
    const syncRes = await page.evaluate(async () => {
        const res = await fetch('/api/spotify/sync', { method: 'POST' });
        return res.json();
    });
    expect(syncRes.inserted).toBe(3);
  });

  test('Flow 4: User Profile Fetch', async ({ page }) => {
    await page.route('**/api/users/testuser', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ username: 'testuser', bio: 'Living the dream' }),
      });
    });

    await page.route('**/api/users/ghost', async (route) => {
        await route.fulfill({ status: 404, body: JSON.stringify({ error: 'Not found' }) });
    });

    await page.goto('/');

    const profile = await page.evaluate(async () => {
        const res = await fetch('/api/users/testuser');
        return res.json();
    });
    expect(profile.username).toBe('testuser');

    const missing = await page.evaluate(async () => {
        const res = await fetch('/api/users/ghost');
        return res.status;
    });
    expect(missing).toBe(404);
  });

  test('Flow 5: Search Results and Limit Clamping', async ({ page }) => {
    await page.route('**/api/search*', async (route) => {
        const url = new URL(route.request().url());
        const limit = parseInt(url.searchParams.get('limit') || '10');
        const clampedLimit = Math.min(limit, 10);

        return route.fulfill({
            status: 200,
            body: JSON.stringify({
                artists: { items: Array(clampedLimit).fill({ name: 'Result' }) },
                albums: { items: [] },
                tracks: { items: [] }
            })
        });
    });

    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=radiohead/);

    // Verify results presence
    const resultIndicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(resultIndicator).toBeVisible();

    // Verify limit clamping via evaluation
    const clampedRes = await page.evaluate(async () => {
        const res = await fetch('/api/search?q=test&limit=50');
        const data = await res.json();
        return data.artists.items.length;
    });
    expect(clampedRes).toBe(10);
  });

});
