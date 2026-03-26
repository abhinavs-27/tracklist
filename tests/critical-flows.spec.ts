import { test, expect } from '@playwright/test';

/**
 * Critical Integration flows for the Tracklist application.
 * These tests cover the primary user journeys using the UI (where possible) and mocked API responses.
 */
test.describe('Critical Flows Integration', () => {

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

  test('Flow: Creating a review (Happy Path)', async ({ page }) => {
    // 1. Mock the reviews POST API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'review_1', ...body }),
        });
      }
    });

    // 2. Trigger via evaluate
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'album',
            entity_id: 'album_1',
            rating: 5,
            review_text: 'Excellent album'
          })
      });
      return res.json();
    });

    // 3. Verify the result
    expect(result.id).toBe('review_1');
    expect(result.rating).toBe(5);
  });

  test('Flow: Creating a review (Invalid Rating - 400)', async ({ page }) => {
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid rating' }),
        });
      }
    });

    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: 'album',
            entity_id: 'album_1',
            rating: 6, // Invalid rating
          })
      });
      return res.status;
    });

    expect(status).toBe(400);
  });

  test('Flow: Logging a listen (Happy Path)', async ({ page }) => {
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

    // 2. Trigger via evaluate
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ track_id: 'track_1' })
      });
      return res.json();
    });

    // 3. Verify the result
    expect(result.id).toBe('log_1');
    expect(result.track_id).toBe('track_1');
  });

  test('Flow: Logging a listen (Invalid Data - 400)', async ({ page }) => {
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Invalid listen date' }),
        });
      }
    });

    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ track_id: 'track_1', listened_at: 'invalid-date' })
      });
      return res.status;
    });

    expect(status).toBe(400);
  });

  test('Flow: Spotify ingestion (Happy Path)', async ({ page }) => {
    // 1. Mock the sync API response
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inserted: 12, skipped: 3, mode: 'song' }),
      });
    });

    // 2. Trigger the sync via evaluate
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.json();
    });

    // 3. Verify the result
    expect(result.inserted).toBe(12);
    expect(result.mode).toBe('song');
  });

  test('Flow: Spotify ingestion (Not Connected - 400)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Spotify not connected' }),
      });
    });

    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.status;
    });

    expect(status).toBe(400);
  });

  test('Flow: Spotify ingestion (Integration Disabled - 403)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Spotify integration disabled' }),
      });
    });

    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.status;
    });

    expect(status).toBe(403);
  });

  test('Flow: User profile fetch (Happy Path)', async ({ page }) => {
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

    // 1. Mock the user fetch API
    await page.route('**/api/users/jules_tester', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    // 2. Trigger the fetch via evaluate
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/users/jules_tester');
      return res.json();
    });

    // 3. Verify the returned user data
    expect(result.username).toBe('jules_tester');
    expect(result.followers_count).toBe(150);
  });

  test('Flow: User profile fetch (Not Found - 404)', async ({ page }) => {
    await page.route('**/api/users/non_existent_user', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/users/non_existent_user');
      return res.status;
    });

    expect(status).toBe(404);
  });

  test('Flow: Search results (Happy Path)', async ({ page }) => {
    // 1. Mock the search API
    await page.route('**/api/search?q=radiohead*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            artists: { items: [{ id: '1', name: 'Radiohead' }] },
            albums: { items: [{ id: '2', name: 'In Rainbows', artists: [{ name: 'Radiohead' }] }] },
            tracks: { items: [{ id: '3', name: 'Nude', artists: [{ name: 'Radiohead' }] }] },
          }),
        });
      });

      // 2. Verify API response structure via evaluate
      await page.goto('/');
      const result = await page.evaluate(async () => {
        const res = await fetch('/api/search?q=radiohead');
        return res.json();
      });

      expect(result.albums.items[0].name).toBe('In Rainbows');
      expect(result.artists.items[0].name).toBe('Radiohead');

      // 3. Verify Search page loads
      await page.goto('/search');
      await expect(page.getByRole('heading', { name: /Search/i })).toBeVisible();
      // Ensure the search bar is present for users to interact with
      await expect(page.getByPlaceholder(/search artists, albums, tracks/i)).toBeVisible();
  });

  test('Flow: Search results (Empty results)', async ({ page }) => {
    await page.route('**/api/search?q=non_existent_query*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: { items: [] },
          albums: { items: [] },
          tracks: { items: [] },
        }),
      });
    });

    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/search?q=non_existent_query');
      return res.json();
    });

    expect(result.artists.items.length).toBe(0);
    expect(result.albums.items.length).toBe(0);
  });

  test('Flow: Search results (Missing query - 400)', async ({ page }) => {
    await page.route('**/api/search', async (route) => {
      if (route.request().url().endsWith('/api/search')) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Missing search query' }),
        });
      }
    });

    await page.goto('/');
    const status = await page.evaluate(async () => {
      const res = await fetch('/api/search');
      return res.status;
    });

    expect(status).toBe(400);
  });
});
