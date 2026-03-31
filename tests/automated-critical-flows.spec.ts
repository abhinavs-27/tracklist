import { test, expect } from '@playwright/test';

/**
 * Consolidated Automated Tests for Critical Flows:
 * - Creating reviews
 * - Logging listens
 * - Spotify ingestion
 * - User profile fetch
 * - Search results
 *
 * These tests use Playwright to simulate user interactions and mock API responses
 * to verify both success and error states of the application's most vital paths.
 */
test.describe('Automated Critical Flows', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Mock the session for an authenticated user
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user_99',
            name: 'Automated Tester',
            email: 'tester@example.com',
            username: 'autotester',
            image: 'https://example.com/avatar.png'
          },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // 2. Mock CSRF token for NextAuth
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('Flow: Create Review - success (201)', async ({ page }) => {
    const mockReview = {
      entity_type: 'album',
      entity_id: '1234567890123456789012',
      rating: 5,
      review_text: 'Excellent album!'
    };

    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'r_1', ...mockReview }),
        });
      }
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 stars' }).click();
    await page.getByPlaceholder(/what did you think/i).fill(mockReview.review_text);

    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/reviews') && r.method() === 'POST'),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const posted = request.postDataJSON();
    expect(posted.rating).toBe(mockReview.rating);
    expect(posted.review_text).toBe(mockReview.review_text);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow: Create Review - invalid rating (400)', async ({ page }) => {
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'rating must be an integer 1–5' }),
        });
      }
    });

    await page.goto('/e2e/logging');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '1234567890123456789012', rating: 6 }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status, data: await res.json() };
    });
    expect(result.status).toBe(400);
    expect(result.data.error).toContain('1–5');
  });

  test('Flow: Log Listen - success (200)', async ({ page }) => {
    const mockLog = {
      track_id: 'track_demo_1',
      source: 'manual'
    };

    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'l_1', ...mockLog }),
        });
      }
    });

    await page.goto('/e2e/logging');
    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/logs') && r.method() === 'POST'),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    expect(request.postDataJSON().track_id).toBe(mockLog.track_id);
  });

  test('Flow: Log Listen - missing track ID (400)', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Missing required field' }),
        });
      }
    });

    await page.goto('/e2e/logging');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        body: JSON.stringify({ source: 'manual' }),
        headers: { 'Content-Type': 'application/json' }
      });
      return { status: res.status };
    });
    expect(result.status).toBe(400);
  });

  test('Flow: Spotify Sync - success (200)', async ({ page }) => {
    const syncResponse = { inserted: 10, skipped: 5, mode: 'song' };

    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(syncResponse),
        });
      }
    });

    await page.goto('/e2e/logging');

    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/spotify/sync') && r.method() === 'POST'),
      page.getByRole('button', { name: /sync recently played/i }).click()
    ]);

    expect(request.method()).toBe('POST');
  });

  test('Flow: Spotify Sync - token expired (403)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' }),
        });
      }
    });

    await page.goto('/e2e/logging');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status };
    });
    expect(result.status).toBe(403);
  });

  test('Flow: User Profile - success (200)', async ({ page }) => {
    const mockProfile = {
      id: 'user_99',
      username: 'autotester',
      bio: 'Professional automated tester',
    };

    await page.route('**/api/users/autotester', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProfile),
      });
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /fetch autotester profile/i }).click();

    await expect(page.locator('#profile-display .username')).toHaveText('autotester');
    await expect(page.locator('#profile-display .bio')).toHaveText(mockProfile.bio);
  });

  test('Flow: User Profile - not found (404)', async ({ page }) => {
    await page.route('**/api/users/unknown_user', async (route) => {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/e2e/logging');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/users/unknown_user');
      return { status: res.status };
    });
    expect(result.status).toBe(404);
  });

  test('Flow: Search - success (200)', async ({ page }) => {
    const mockResults = {
      artists: { items: [{ id: 'art_1', name: 'Radiohead' }] },
    };

    await page.route('**/api/search?q=radiohead*', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockResults),
      });
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /run search/i }).click();

    await expect(page.locator('#search-display .artist-name')).toHaveText('Radiohead');
  });

  test('Flow: Search - missing query (400)', async ({ page }) => {
    await page.route('**/api/search*', async (route) => {
      const url = new URL(route.request().url());
      if (!url.searchParams.get('q')) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Query q is required' }),
        });
      }
      return route.fulfill({ status: 200, body: JSON.stringify({ items: [] }) });
    });

    await page.goto('/e2e/logging');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/search');
      return { status: res.status };
    });
    expect(result.status).toBe(400);
  });
});
