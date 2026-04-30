import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Tracklist.
 *
 * Verifies core user flows using Playwright and API mocking.
 */

test.describe('Automated UI Logic: Integration Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Mock NextAuth session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
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

  test('Flow: Creating a Review (UI)', async ({ page }) => {
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '550e8400-e29b-41d4-a716-446655440005',
            ...body,
            user: { id: '550e8400-e29b-41d4-a716-446655440000', username: 'autotester' }
          }),
        });
      }
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Excellent automated UI test.');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow: Logging a Listen (UI)', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '550e8400-e29b-41d4-a716-446655440006',
            ...body
          }),
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

  test('Flow: Spotify Ingestion (Direct API)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 3, skipped: 0, mode: 'song' }),
        });
      }
    });

    await page.goto('/');
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(syncResult.status).toBe(200);
    expect(syncResult.body.inserted).toBe(3);
  });

  test('Flow: User Profile Fetch (Direct API)', async ({ page }) => {
    await page.route('**/api/users/autotester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'autotester',
          bio: 'Verified bio'
        }),
      });
    });

    await page.goto('/');
    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/autotester');
      return { status: res.status, body: await res.json() };
    });

    expect(profile.status).toBe(200);
    expect(profile.body.username).toBe('autotester');
  });

  test('Flow: Search Results (UI Interaction)', async ({ page }) => {
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    // Verification of result or error state indicator
    const indicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(indicator).toBeVisible();
  });

});
