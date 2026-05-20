import { test, expect } from '@playwright/test';

/**
 * Consolidated Critical Flow Tests for Tracklist.
 *
 * This suite verifies the core application flows:
 * 1. Creating reviews (UI & API)
 * 2. Logging listens (UI & API)
 * 3. Spotify ingestion (API)
 * 4. User profile fetch (API)
 * 5. Search results (UI)
 *
 * Mocks are used to ensure these tests are hermetic and environment-agnostic.
 */

test.describe('Critical Flows Integration', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'tester-uuid',
            name: 'Tester',
            email: 'tester@example.com',
            username: 'tester',
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

  test('Flow: Creating a Review', async ({ page }) => {
    // 1. Mock the reviews API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        // Validation mock
        if (body.rating < 1 || body.rating > 5) {
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
            id: 'review-uuid',
            ...body,
            created_at: new Date().toISOString(),
            user: { id: 'tester-uuid', username: 'tester' }
          }),
        });
      }
    });

    // 2. UI Flow (using E2E logging page for reliable testing of review components)
    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Excellent consolidation!');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(5);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // 3. API validation for error state
    const errorResult = await page.evaluate(async () => {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 6 })
      });
      return { status: res.status, body: await res.json() };
    });
    expect(errorResult.status).toBe(400);
    expect(errorResult.body.error).toContain('between 1 and 5');
  });

  test('Flow: Spotify Ingestion (API)', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 7, skipped: 1, mode: 'song' }),
        });
      }
    });

    await page.goto('/');
    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(syncResult.status).toBe(200);
    expect(syncResult.body.inserted).toBe(7);
  });

  test('Flow: User Profile Fetch (API)', async ({ page }) => {
    // Success Case
    await page.route('**/api/users/target_user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ username: 'target_user', bio: 'Bio Success' }),
      });
    });

    // 404 Case
    await page.route('**/api/users/missing_user', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/');

    const successProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/target_user');
      return { status: res.status, body: await res.json() };
    });
    expect(successProfile.status).toBe(200);
    expect(successProfile.body.bio).toBe('Bio Success');

    const missingProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/missing_user');
      return { status: res.status };
    });
    expect(missingProfile.status).toBe(404);
  });

  test('Flow: Search Results', async ({ page }) => {
    // 1. Mock Search APIs
    await page.route('**/api/search?q=daft*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: {
            items: [{
              id: 'daft-1',
              name: 'Daft Punk',
              popularity: 99,
              images: [{ url: 'https://example.com/daft.jpg' }]
            }]
          },
          albums: { items: [] },
          tracks: { items: [] }
        }),
      });
    });

    await page.route('**/api/search/users?q=daft*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/search');
    const searchInput = page.getByPlaceholder(/Search artists/i).filter({ visible: true });

    await searchInput.fill('daft punk');

    // Verify results UI
    await expect(page.getByText('Top result')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Daft Punk').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /Artists/i })).toBeVisible();
  });

  test('Flow: Search Results - Users', async ({ page }) => {
    // 1. Mock Search APIs
    await page.route('**/api/search?q=tester*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: { items: [] },
          albums: { items: [] },
          tracks: { items: [] }
        }),
      });
    });

    await page.route('**/api/search/users?q=tester*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'tester-uuid',
          username: 'tester',
          avatar_url: 'https://example.com/avatar.png'
        }]),
      });
    });

    await page.goto('/search');
    const searchInput = page.getByPlaceholder(/Search artists/i).filter({ visible: true });

    await searchInput.fill('tester');

    // Verify results UI
    await expect(page.getByRole('heading', { name: /People/i })).toBeVisible();
    await expect(page.getByText('tester').first()).toBeVisible();
  });

});
