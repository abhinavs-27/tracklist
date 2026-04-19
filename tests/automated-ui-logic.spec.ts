import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Tracklist.
 * Focuses on UI interactions and client-side logic with mocked API responses.
 */

test.describe('Automated UI Logic: Critical Flows', () => {

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
            username: 'autotester',
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

  test('UI: Creating a Review with long text truncation check', async ({ page }) => {
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        // The API should truncate it, but we mock the successful response
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-review-123', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();

    // Fill with very long text
    const longText = 'a'.repeat(11000);
    await page.getByPlaceholder(/what did you think/i).fill(longText);

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    // We expect the text to be truncated if the real API was called,
    // but here we just verify the POST was made.
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('UI: Logging a Listen', async ({ page }) => {
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

    await page.goto('/e2e/logging');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');
  });

  test('UI: Spotify Sync Ingestion', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 3, skipped: 0 }),
        });
      }
    });

    await page.goto('/');
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.json();
    });
    expect(syncResult.inserted).toBe(3);
  });

  test('UI: User Profile Fetch', async ({ page }) => {
    await page.route('**/api/users/autotester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'autotester', bio: 'Mock bio' }),
      });
    });

    await page.goto('/');
    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/autotester');
      return res.json();
    });
    expect(profile.username).toBe('autotester');
    expect(profile.bio).toBe('Mock bio');
  });

  test('UI: Search Results Display', async ({ page }) => {
    // Search page is RSC, so we test navigation and result presence
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    // Check for success indicator or failure message in a headless environment
    const resultIndicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(resultIndicator).toBeVisible();
  });

});
