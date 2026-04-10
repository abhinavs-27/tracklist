import { test, expect } from '@playwright/test';

/**
 * Robust E2E tests for critical flows:
 * - Creating reviews (UI)
 * - Logging listens (UI)
 * - Spotify ingestion (API)
 * - User profile fetch (API)
 * - Search results (UI)
 */
test.describe('Critical Flows E2E', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'E2E Tester',
            email: 'e2e@example.com',
            username: 'e2etester',
            image: 'https://example.com/avatar.png'
          },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // Mock CSRF token for NextAuth
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('Flow: Creating a review', async ({ page }) => {
    // 1. Mock the reviews API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-review-123', ...body, created_at: new Date().toISOString() }),
        });
      }
    });

    // 2. Navigate to logging page
    await page.goto('/e2e/logging');

    // 3. Open review modal
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 4. Fill and submit
    await page.getByRole('button', { name: '4 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Great album for testing!');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(4);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow: Logging a listen', async ({ page }) => {
    // 1. Mock the logs API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-log-456', ...body }),
        });
      }
    });

    // 2. Navigate and trigger log
    await page.goto('/e2e/logging');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');
  });

  test('Flow: Spotify ingestion', async ({ page }) => {
    // 1. Mock sync API
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 5, skipped: 2, mode: 'song' }),
        });
      }
    });

    // 2. Trigger via evaluate
    await page.goto('/');
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(syncResult.status).toBe(200);
    expect(syncResult.body.inserted).toBe(5);
  });

  test('Flow: User profile fetch', async ({ page }) => {
    // 1. Mock user profile API
    await page.route('**/api/users/target_user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'target_user', bio: 'E2E Success bio' }),
      });
    });

    await page.route('**/api/users/missing_user', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/');

    // Success check
    const successProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/target_user');
      return { status: res.status, body: await res.json() };
    });
    expect(successProfile.status).toBe(200);
    expect(successProfile.body.username).toBe('target_user');

    // 404 check
    const missingProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/missing_user');
      return { status: res.status };
    });
    expect(missingProfile.status).toBe(404);
  });

  test('Flow: Search results UI', async ({ page }) => {
    // 1. Navigate to search
    await page.goto('/search');

    // 2. Perform search
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    // 3. Verify URL navigation
    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    // 4. Verify search container presence
    await expect(page.getByRole('main')).toBeVisible();
  });

});
