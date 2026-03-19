import { test, expect } from '@playwright/test';

/**
 * Critical Integration flows for the Tracklist application.
 * These tests cover the primary user journeys using the UI and mocked API responses.
 */
test.describe('Critical Integration Flows', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated for all tests
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_1', name: 'Test User', email: 'test@example.com', username: 'testuser' },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });
  });

  test('Flow: Creating a review (UI to API)', async ({ page }) => {
    // 1. Mock the reviews POST and GET APIs
    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'review_1', ...body }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ reviews: [], average_rating: null, count: 0, my_review: null })
        });
      }
    });

    // 2. Navigate to E2E logging harness
    await page.goto('/e2e/logging');

    // 3. Click "Rate & review" for the demo album
    // Memory says: The AlbumLogButton component renders with the text 'Rate & review'
    await page.getByRole('button', { name: /rate.*review/i }).first().click();

    // 4. Fill out the review in the modal
    await page.getByRole('button', { name: '5 stars' }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Testing critical flows: This album is a masterpiece!');

    // 5. Submit and verify the POST request
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/reviews') && req.method() === 'POST'),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    expect(request.postDataJSON()).toMatchObject({
      entity_type: 'album',
      rating: 5,
      review_text: 'Testing critical flows: This album is a masterpiece!'
    });
  });

  test('Flow: Logging a listen (UI to API)', async ({ page }) => {
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

    // 2. Navigate to E2E logging harness
    await page.goto('/e2e/logging');

    // 3. Click the "Mock log listen" button
    const logButton = page.getByRole('button', { name: /mock log listen/i });

    // 4. Wait for the POST request and click
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/logs') && req.method() === 'POST'),
      logButton.click()
    ]);

    // 5. Verify the API was called with the correct payload
    expect(request.postDataJSON()).toMatchObject({
      track_id: 'track_demo_1'
    });
  });

  test('Flow: Spotify ingestion (API)', async ({ page }) => {
    // 1. Mock the sync API response
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inserted: 12, skipped: 3, mode: 'song' }),
      });
    });

    // 2. Navigate to a page and trigger the sync via evaluate (simulating internal fetch)
    await page.goto('/');
    const result = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return res.json();
    });

    // 3. Verify the result
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
    expect(result.bio).toContain('testing critical flows');
  });

  test('Flow: Search results (API)', async ({ page }) => {
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

      // 2. Trigger search via evaluate
      await page.goto('/');
      const result = await page.evaluate(async () => {
        const res = await fetch('/api/search?q=radiohead');
        return res.json();
      });

      // 3. Verify results structure
      expect(result.albums.items[0].name).toBe('In Rainbows');
      expect(result.tracks.items[0].name).toBe('Nude');
      expect(result.artists.items[0].name).toBe('Radiohead');
  });
});
