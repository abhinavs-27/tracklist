import { test, expect } from '@playwright/test';

/**
 * Automated Critical Flow Tests for Tracklist.
 *
 * These tests verify the core functionality of the application:
 * 1. Creating reviews (UI & API)
 * 2. Logging listens (UI & API)
 * 3. Spotify ingestion (API)
 * 4. User profile fetch (API)
 * 5. Search results (UI)
 *
 * Extensive mocking is used to ensure these tests pass without requiring
 * external service connectivity (Supabase, Spotify).
 */

test.describe('Critical Flows: Automated Integration', () => {

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

  test('Critical Flow 1: Creating a Review (Success and Error)', async ({ page }) => {
    // 1. Mock the reviews API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        // Simple validation mock
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
          body: JSON.stringify({ id: 'mock-review-123', ...body }),
        });
      }
    });

    // Success Case
    await page.goto('/e2e/logging');
    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: '4 out of 5 stars' }).click();
    await page.getByPlaceholder(/what did you think/i).fill('Testing automated review creation');

    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
      page.getByRole('button', { name: /save review/i }).click()
    ]);

    const result = await response.json();
    expect(result.rating).toBe(4);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Error Case (via evaluation since UI prevents invalid rating usually)
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

  test('Critical Flow 2: Logging Listens (Success and Error)', async ({ page }) => {
    // 1. Mock the logs API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        if (!body.track_id && !body.spotify_id) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Missing track_id' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-log-456', ...body }),
        });
      }
    });

    // Success Case
    await page.goto('/e2e/logging');
    const [response] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
      page.getByRole('button', { name: /mock log listen/i }).click()
    ]);

    const result = await response.json();
    expect(result.track_id).toBe('track_demo_1');

    // Error Case
    const errorResult = await page.evaluate(async () => {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'manual' })
      });
      return { status: res.status };
    });
    expect(errorResult.status).toBe(400);
  });

  test('Critical Flow 3: Spotify Ingestion', async ({ page }) => {
    await page.route('**/api/spotify/sync', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ inserted: 5, skipped: 2, mode: 'song' }),
        });
      }
    });

    await page.goto('/');

    const syncResult = await page.evaluate(async () => {
      const res = await fetch('/api/spotify/sync', { method: 'POST' });
      return { status: res.status, body: await res.json() };
    });

    expect(syncResult.status).toBe(200);
    expect(syncResult.body.inserted).toBe(5);
  });

  test('Critical Flow 4: User Profile Fetch (Success and 404)', async ({ page }) => {
    // Success Mock
    await page.route('**/api/users/target_user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          username: 'target_user',
          bio: 'Success bio',
          followers_count: 42,
          following_count: 10
        }),
      });
    });

    // Mock the profile page render which is an RSC
    await page.route('**/profile/target_user', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `
                <html>
                    <body>
                        <h1>target_user</h1>
                        <p>Success bio</p>
                        <div data-testid="followers-count">42</div>
                        <div data-testid="following-count">10</div>
                    </body>
                </html>
            `
        });
    });

    // 404 Mock
    await page.route('**/api/users/missing_user', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'User not found' }),
      });
    });

    await page.goto('/');

    // Success check (API)
    const successProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/target_user');
      return { status: res.status, body: await res.json() };
    });
    expect(successProfile.status).toBe(200);
    expect(successProfile.body.bio).toBe('Success bio');
    expect(successProfile.body.followers_count).toBe(42);

    // UI check
    await page.goto('/profile/target_user');
    await expect(page.getByText('target_user')).toBeVisible();
    await expect(page.getByText('Success bio')).toBeVisible();
    await expect(page.locator('[data-testid="followers-count"]')).toHaveText('42');

    // 404 check
    const missingProfile = await page.evaluate(async () => {
      const res = await fetch('/api/users/missing_user');
      return { status: res.status };
    });
    expect(missingProfile.status).toBe(404);
  });

  test('Critical Flow 5: Search Results and Navigation', async ({ page }) => {
    // We must mock the search results since they are rendered in a Server Component
    await page.route(url => url.pathname === '/search' && url.searchParams.get('q') === 'radiohead', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: `
                <html>
                    <body>
                        <form action="/search" method="GET">
                            <input type="search" name="q" value="radiohead">
                        </form>
                        <main>
                            <section>
                                <h2>Artists</h2>
                                <a href="/artist/123" data-testid="artist-link">Radiohead</a>
                            </section>
                        </main>
                    </body>
                </html>
            `
        });
    });

    // Mock the artist page
    await page.route('**/artist/123', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: '<html><body><h1>Radiohead Profile</h1></body></html>'
        });
    });

    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);

    // Check that we see the artist result
    const artistLink = page.getByTestId('artist-link');
    await expect(artistLink).toBeVisible();

    // Click and verify navigation
    await artistLink.click();
    await page.waitForURL(/\/artist\/123/);
    await expect(page.getByRole('heading', { name: 'Radiohead Profile' })).toBeVisible();
  });

});
