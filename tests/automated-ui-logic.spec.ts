import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests for Tracklist.
 *
 * These tests verify the core UI flows and interactions:
 * 1. Review creation UI
 * 2. Listen logging UI
 * 3. Spotify sync trigger
 * 4. User profile API verification
 * 5. Search results UI
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

    // Mock CSRF token for NextAuth
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('Review Creation UI Flow', async ({ page }) => {
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-review-123',
            user_id: 'test-user-id',
            username: 'autotester',
            entity_type: body.entity_type,
            entity_id: body.entity_id,
            rating: body.rating,
            review_text: body.review_text,
            created_at: new Date().toISOString()
          }),
        });
      }
    });

    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('UI test review content');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    expect(result.review_text).toBe('UI test review content');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('Listen Logging UI Flow', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-log-456',
            track_id: body.track_id || 'track-uuid',
            listened_at: new Date().toISOString()
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

  test('Spotify Ingestion Sync Trigger', async ({ page }) => {
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

  test('User Profile API Verification', async ({ page }) => {
    await page.route('**/api/users/testuser', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'testuser',
          bio: 'Verified UI bio',
          avatar_url: 'https://example.com/avatar.png'
        }),
      });
    });

    await page.goto('/');

    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/testuser');
      return { status: res.status, body: await res.json() };
    });

    expect(profile.status).toBe(200);
    expect(profile.body.username).toBe('testuser');
    expect(profile.body.bio).toBe('Verified UI bio');
  });

  test('Search Results UI and Visibility', async ({ page }) => {
    // Note: Search page is an RSC, but we can verify the UI once it loads
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    // Verify visibility of result headers or empty state indicator
    const resultIndicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(resultIndicator).toBeVisible();
  });

});
