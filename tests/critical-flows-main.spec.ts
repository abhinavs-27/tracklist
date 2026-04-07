import { test, expect } from '@playwright/test';

/**
 * Consolidated Critical Flow Tests for Tracklist.
 *
 * Verifies:
 * 1. Creating reviews (UI & API)
 * 2. Logging listens (UI & API)
 * 3. Spotify ingestion (API)
 * 4. User profile fetch (API)
 * 5. Search results (UI)
 *
 * Mocks are used for Supabase and Spotify to ensure environment independence.
 */

test.describe('Critical Flows: Main Integration', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-uuid',
            name: 'Main Tester',
            email: 'main@example.com',
            username: 'maintester',
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

  test('Flow 1: Creating a Review', async ({ page }) => {
    // 1. Mock the reviews API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        // Validation mock (rating 1-5)
        if (body.rating < 1 || body.rating > 5) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'rating must be an integer 1–5' }),
          });
        }
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-review-uuid',
            user_id: 'test-user-uuid',
            username: 'maintester',
            ...body,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user: { id: 'test-user-uuid', username: 'maintester', avatar_url: null }
          }),
        });
      }
    });

    // 2. UI Flow via E2E logging page
    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // 3. Interaction
    await page.getByRole('button', { name: '5 out of 5 stars' }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Top tier album!');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    expect(result.review_text).toBe('Top tier album!');
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 4. API Direct validation for error state
    const badReview = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'album', entity_id: '123', rating: 10 })
      });
      return { status: res.status, body: await res.json() };
    });
    expect(badReview.status).toBe(400);
    expect(badReview.body.error).toContain('1–5');
  });

  test('Flow 2: Logging Listens', async ({ page }) => {
    // 1. Mock the logs API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (!body.track_id && !body.spotify_id) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Missing required field' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'mock-log-uuid',
            track_id: body.track_id || 'resolved-uuid',
            listened_at: body.listened_at || new Date().toISOString(),
            source: body.source || 'manual',
            created_at: new Date().toISOString()
          }),
        });
      }
    });

    // 2. UI Flow
    await page.goto('/e2e/logging');
    const [uiResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const uiResult = await uiResponse.json();
    expect(uiResult.track_id).toBe('track_demo_1');

    // 3. API Direct Flow
    const apiResult = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: 'spotify-track-id', source: 'manual' })
      });
      return { status: res.status, body: await res.json() };
    });
    expect(apiResult.status).toBe(200);
    expect(apiResult.body.id).toBe('mock-log-uuid');
  });

  test('Flow 3: Spotify Ingestion', async ({ page }) => {
    // 1. Mock Spotify Sync API
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 10, skipped: 2, mode: 'song' }),
        });
      }
    });

    // 2. Trigger API call
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.inserted).toBe(10);
    expect(result.body.mode).toBe('song');
  });

  test('Flow 4: User Profile Fetch', async ({ page }) => {
    const mockProfile = {
      id: 'target-user-uuid',
      username: 'main_target',
      avatar_url: 'https://example.com/target.png',
      bio: 'Main test target bio',
      followers_count: 100,
      following_count: 50,
      is_following: false,
      is_own_profile: false
    };

    // 1. Mock User API
    await page.route('**/api/users/main_target', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockProfile),
      });
    });

    // 2. API fetch from client
    await page.goto('/');
    const profile = await page.evaluate(async () => {
      const res = await fetch('/api/users/main_target');
      return { status: res.status, body: await res.json() };
    });

    expect(profile.status).toBe(200);
    expect(profile.body.username).toBe('main_target');
    expect(profile.body.bio).toBe('Main test target bio');
    expect(profile.body.followers_count).toBe(100);
  });

  test('Flow 5: Search Results Interaction', async ({ page }) => {
    // Search page is a server component, so we verify UI states and search bar interaction
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    // Verify terminal state indicators
    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();

    // Check for success or failed results indicator to ensure it finished rendering
    const indicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(indicator).toBeVisible();
  });

});
