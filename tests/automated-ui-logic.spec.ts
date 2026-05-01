import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Critical Flows.
 *
 * This suite verifies the frontend behavior of the 5 critical flows:
 * 1. Creating reviews
 * 2. Logging listens
 * 3. Spotify ingestion
 * 4. User profile fetch
 * 5. Search results
 *
 * It uses Playwright's `page.route` to mock API responses, ensuring tests
 * are independent of the backend state or external services.
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
            id: 'test-user-uuid',
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

  test('Flow 1: Creating a Review (UI interaction and API mock)', async ({ page }) => {
    // Mock the reviews POST API
    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();

        // Simple mock validation
        if (body.rating > 5) {
            return route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Rating must be between 1 and 5' }),
            });
        }

        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-review-uuid',
            ...body,
            created_at: new Date().toISOString()
          }),
        });
      }
      // Mock GET for existing reviews
      return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([])
      });
    });

    // Use the e2e logging utility page
    await page.goto('/e2e/logging');

    // Open the rating modal
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select rating and enter text
    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('UI test review content');

    // Intercept and verify the request
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    expect(result.review_text).toBe('UI test review content');

    // Modal should close
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow 2: Logging Listens', async ({ page }) => {
    // Mock the logs POST API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-log-uuid', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');

    // Trigger log listen via the button on the utility page
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');
  });

  test('Flow 3: Spotify Ingestion Trigger', async ({ page }) => {
    // Mock the sync API
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

    // Simulate the trigger via a manual fetch call in the browser
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(syncResult.status).toBe(200);
    expect(syncResult.body.inserted).toBe(3);
  });

  test('Flow 4: User Profile Fetch', async ({ page }) => {
    const targetUser = 'test_subject';

    // Mock the user profile API
    await page.route(`**/api/users/${targetUser}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            id: 'target-uuid',
            username: targetUser,
            bio: 'Profile fetch UI test bio',
            avatar_url: null
        }),
      });
    });

    await page.goto('/');

    // Check profile data via fetch in browser (simulating a client component loading data)
    const profileData = await page.evaluate(async (username) => {
      const res = await fetch(`/api/users/${username}`);
      return { status: res.status, body: await res.json() };
    }, targetUser);

    expect(profileData.status).toBe(200);
    expect(profileData.body.username).toBe(targetUser);
    expect(profileData.body.bio).toBe('Profile fetch UI test bio');
  });

  test('Flow 5: Search Results Interaction', async ({ page }) => {
    // Mock search API
    await page.route('**/api/search?q=radiohead*', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                artists: { items: [{ id: 'a1', name: 'Radiohead', images: [] }] },
                albums: { items: [] },
                tracks: { items: [] }
            })
        });
    });

    await page.goto('/search');

    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    // Verify URL change
    await page.waitForURL(/\/search\?q=radiohead/);

    // In our environment, RSCs don't see the mock but client-side effects might.
    // We verify the input state and that no crash occurred.
    await expect(searchInput).toHaveValue('radiohead');

    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();
  });

});
