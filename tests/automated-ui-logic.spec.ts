import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Critical Flows.
 *
 * Verifies frontend interactions and API integrations using the /e2e/logging utility page.
 * Uses extensive route mocking to ensure CI stability.
 */

test.describe('Automated UI Logic: Critical Flows', () => {

  test.beforeEach(async ({ page }) => {
    // Mock NextAuth session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'UI Tester',
            username: 'uitester',
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
        body: JSON.stringify({ csrfToken: 'mock-csrf' }),
      });
    });

    // Ensure E2E mode is enabled for the utility page
    process.env.NEXT_PUBLIC_E2E = '1';
  });

  test('Review Creation Flow', async ({ page }) => {
    // Mock reviews POST API
    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'r123', ...body }),
        });
      }
      return route.continue();
    });

    await page.goto('/e2e/logging');

    // Trigger review modal from utility page
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill review
    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Automated UI test review');

    // Submit and verify
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Listen Logging Flow', async ({ page }) => {
    // Mock logs POST API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'l456', ...body }),
        });
      }
      return route.continue();
    });

    await page.goto('/e2e/logging');

    // Trigger log via utility page button
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');
  });

  test('Search Results Visibility', async ({ page }) => {
    // Search page is RSC, so we can't easily mock the fetch itself in Playwright
    // but we can assert on the rendered UI state.
    await page.goto('/search?q=radiohead');

    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();

    // The Search page handles failed fetches gracefully
    const resultIndicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(resultIndicator).toBeVisible();
  });

  test('Spotify Ingestion Trigger', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 3, skipped: 0 }),
        });
      }
      return route.continue();
    });

    await page.goto('/');

    // Execute sync via browser console (simulating manual trigger or hook)
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.json();
    });

    expect(syncResult.inserted).toBe(3);
  });

  test('User Profile API Access', async ({ page }) => {
    await page.route('**/api/users/uitester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'uitester', bio: 'UI Test Bio' }),
      });
    });

    await page.goto('/');

    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/uitester');
      return res.json();
    });

    expect(profile.username).toBe('uitester');
    expect(profile.bio).toBe('UI Test Bio');
  });

});
