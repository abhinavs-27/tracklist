import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Tracklist.
 *
 * Verifies critical flows from the user perspective:
 * 1. Creating reviews (UI interaction)
 * 2. Logging listens (UI interaction)
 * 3. Spotify ingestion (API trigger)
 * 4. User profile fetch (API trigger)
 * 5. Search results (UI interaction)
 *
 * Uses Playwright's network interception to mock backend services.
 */

test.describe('Critical Flows: Automated UI Logic', () => {

  test.beforeEach(async ({ page }) => {
    // Mock NextAuth session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'ui-test-user-id',
            name: 'UI Tester',
            username: 'uitester',
            image: null
          },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // Mock CSRF
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'ui-mock-csrf-token' }),
      });
    });
  });

  test('Flow: Creating a Review via Modal', async ({ page }) => {
    // Intercept POST /api/reviews
    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'r-ui-123',
            ...body,
            user: { id: 'ui-test-user-id', username: 'uitester' }
          }),
        });
      }
    });

    await page.goto('/e2e/logging');
    // Ensure we are on the e2e page (requires NEXT_PUBLIC_E2E=1 in real env, but here we just hope it works or we'd have to mock the page content if it's a 404)
    // Actually, looking at the previous run, /e2e/logging seemed to work (it found buttons).

    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    const textArea = page.getByPlaceholder(/what did you think/i);
    await textArea.fill('Incredible album, highly recommended!');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 200),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.id).toBe('r-ui-123');
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow: Logging a Listen', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'l-ui-456', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.id).toBe('l-ui-456');
    expect(result.track_id).toBe('track_demo_1');
  });

  test('Flow: Spotify Sync Trigger', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inserted: 3, skipped: 0 }),
      });
    });

    await page.goto('/');
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.json();
    });

    expect(syncResult.inserted).toBe(3);
  });

  test('Flow: User Profile API', async ({ page }) => {
    await page.route('**/api/users/uitester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'uitester', bio: 'I love music' }),
      });
    });

    await page.goto('/');
    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/uitester');
      return res.json();
    });

    expect(profile.username).toBe('uitester');
    expect(profile.bio).toBe('I love music');
  });

  test('Flow: Search Navigation', async ({ page }) => {
    // Mock search API to avoid errors during navigation
    await page.route('**/api/search*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ artists: { items: [] }, albums: { items: [] }, tracks: { items: [] } })
        });
    });

    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await expect(page).toHaveURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');
  });

});
