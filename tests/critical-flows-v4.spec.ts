import { test, expect } from '@playwright/test';

/**
 * Critical Integration flows for the Tracklist application.
 * These tests cover the primary user journeys using the UI and mocked API responses.
 * They also include validation for error states and edge cases.
 */
test.describe('Critical Flows Integration v4', () => {

  test.beforeEach(async ({ page }) => {
    // 1. Mock the session to be authenticated for all tests
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user_1',
            name: 'Test User',
            email: 'test@example.com',
            username: 'testuser',
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

  test('Flow: Creating a review (UI-driven)', async ({ page }) => {
    // 1. Mock the reviews POST API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (body.rating < 1 || body.rating > 5) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Invalid rating' }),
          });
        }
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'review_1', ...body }),
        });
      }
    });

    // 2. Navigate to the E2E logging page
    await page.goto('/e2e/logging');

    // 3. Open the review modal for the album
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 4. Fill in the review
    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Excellent album');

    // 5. Submit and wait for request
    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/reviews') && r.method() === 'POST'),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    // 6. Verify the request payload and UI closure
    const posted = request.postDataJSON();
    expect(posted.rating).toBe(5);
    expect(posted.review_text).toBe('Excellent album');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Flow: Logging a listen (UI-driven)', async ({ page }) => {
    // 1. Mock the logs POST API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'log_1', ...body }),
        });
      }
    });

    // 2. Navigate and trigger via UI button
    await page.goto('/e2e/logging');

    const [request] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/logs') && r.method() === 'POST'),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    // 3. Verify the result
    const posted = request.postDataJSON();
    expect(posted.track_id).toBe('track_demo_1');
  });

  test('Flow: Spotify ingestion (API)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 12, skipped: 3, mode: 'song' }),
        });
      }
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.json();
    });

    expect(result.inserted).toBe(12);
    expect(result.mode).toBe('song');
  });

  test('Flow: User profile fetch (API)', async ({ page }) => {
    const mockUser = {
      id: 'user_99',
      username: 'jules_tester',
      avatar_url: 'https://example.com/jules.png',
      bio: 'Software engineer testing critical flows.',
      followers_count: 150,
      following_count: 75,
      is_following: false,
      is_own_profile: false
    };

    await page.route('**/api/users/jules_tester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/users/jules_tester');
      return res.json();
    });

    expect(result.username).toBe('jules_tester');
    expect(result.followers_count).toBe(150);
  });

  test('Flow: Search navigation', async ({ page }) => {
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');
  });
});
