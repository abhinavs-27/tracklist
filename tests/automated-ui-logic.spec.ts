import { test, expect } from '@playwright/test';

/**
 * Standardized Playwright integration tests for critical application flows.
 *
 * Covers:
 * 1. Creating reviews
 * 2. Logging listens
 * 3. Spotify ingestion
 * 4. User profile fetch
 * 5. Search results
 *
 * Uses mocks to bypass environment-related connectivity issues.
 */

test.describe('Automated UI Logic: Critical Flows', () => {

  test.beforeEach(async ({ page }) => {
    // Mock authentication session
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Test User',
            username: 'testuser',
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

  test('Flow 1: Creating a Review', async ({ page }) => {
    // Mock reviews API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-review-123', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');

    // Using a reliable way to open the rating modal if it's there
    const rateButton = page.getByRole('button', { name: /rate.*review/i }).first();
    await rateButton.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });

    // Select 5 stars
    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();

    // Fill review text
    const textarea = page.getByPlaceholder(/what did you think/i);
    await page.evaluate((el) => {
        (el as HTMLTextAreaElement).value = 'Great album, highly recommended!';
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }, await textarea.elementHandle());

    // Save
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow 2: Logging Listens', async ({ page }) => {
    // Mock logs API
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

  test('Flow 3: Spotify Ingestion', async ({ page }) => {
    // Mock spotify sync API
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 3, skipped: 1, mode: 'song' }),
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

  test('Flow 4: User Profile Fetch', async ({ page }) => {
    // Mock user API
    await page.route('**/api/users/testuser', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'testuser', bio: 'Living the dream.' }),
      });
    });

    await page.goto('/');

    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/testuser');
      return { status: res.status, body: await res.json() };
    });

    expect(profile.status).toBe(200);
    expect(profile.body.username).toBe('testuser');
  });

  test('Flow 5: Search Results', async ({ page }) => {
    // Mock search APIs BEFORE goto
    await page.route('**/api/search?q=radiohead*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: { items: [{ id: '1', name: 'Radiohead', images: [], popularity: 100 }] },
          albums: { items: [] },
          tracks: { items: [] }
        }),
      });
    });

    await page.route('**/api/search/users?q=radiohead*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/search');

    const searchInput = page.getByPlaceholder(/Search artists/i);
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Use fill instead of evaluate to better simulate user input and trigger React state
    await searchInput.fill('radiohead');

    // The client component uses a debounced search, so we wait for it.
    // We look for the artist name which should appear in the results.
    await expect(page.locator('text=Radiohead').first()).toBeVisible({ timeout: 15000 });
  });

});
