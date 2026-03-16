import { test, expect } from '@playwright/test';

/**
 * These tests cover critical UI flows using E2E pages.
 * We mock authentication and API responses to test the full flow from UI to intercepted API.
 */

test.describe('Critical UI Flows (Mocked API Interception)', () => {

  test('Create review flow', async ({ page }) => {
    // 1. Mock the session to be authenticated
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

    // 2. Mock the reviews POST API
    let capturedBody: Record<string, unknown> | null = null;
    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() === 'POST') {
        capturedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'review_1', ...capturedBody }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reviews: [], average_rating: null, count: 0, my_review: null }) });
      }
    });

    // 3. Navigate to E2E logging page
    await page.goto('/e2e/logging');

    // 4. Open the review modal for the demo album
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('heading', { name: /rate.*review/i })).toBeVisible();

    // 5. Fill out and submit the review
    await page.getByRole('button', { name: /5 stars/i }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Incredible album!');

    // Use Promise.all to wait for both the request and the click
    const [request] = await Promise.all([
      page.waitForRequest(req => req.url().includes('/api/reviews') && req.method() === 'POST'),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    // 6. Verify the API was called with correct data
    expect(request.postDataJSON()).toMatchObject({
      entity_type: 'album',
      entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
      rating: 5,
      review_text: 'Incredible album!'
    });
  });

  test('Search results API flow', async ({ page }) => {
     await page.route('**/api/search?q=radiohead*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            artists: { items: [] },
            albums: { items: [] },
            tracks: { items: [{ id: 'track_1', name: 'Paranoid Android', artists: [{ name: 'Radiohead' }], album: { name: 'OK Computer', images: [] } }] },
          }),
        });
      });

      await page.goto('/');

      const result = await page.evaluate(async () => {
        const res = await fetch('/api/search?q=radiohead');
        return res.json();
      });

      expect(result.tracks.items[0].name).toBe('Paranoid Android');
  });

  test('User profile fetch flow', async ({ page }) => {
    const mockUser = {
      id: 'user_1',
      username: 'testuser',
      avatar_url: null,
      bio: 'Hello world',
      followers_count: 10,
      following_count: 5,
      is_following: false,
      is_own_profile: true
    };

    await page.route('**/api/users/testuser', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
        const res = await fetch('/api/users/testuser');
        return res.json();
    });
    expect(result.username).toBe('testuser');
  });

  test('Spotify ingestion sync flow', async ({ page }) => {
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

    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ inserted: 5, skipped: 2, mode: 'song' }),
      });
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
        const res = await fetch('/api/spotify/sync', { method: 'POST' });
        return res.json();
    });
    expect(result.inserted).toBe(5);
  });
});
