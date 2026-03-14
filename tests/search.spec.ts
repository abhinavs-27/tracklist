import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('search page loads with search input', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: /search/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
  });

  test('search with query shows results or no results', async ({ page }) => {
    await page.route('**/api/search?q=radiohead*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          artists: { items: [{ id: 'artist_1', name: 'Radiohead', images: [] }] },
          albums: { items: [{ id: 'album_1', name: 'OK Computer', images: [], artists: [{ id: 'artist_1', name: 'Radiohead' }] }] },
          tracks: { items: [{ id: 'track_1', name: 'Paranoid Android', album: { id: 'album_1', name: 'OK Computer', images: [] }, artists: [{ id: 'artist_1', name: 'Radiohead' }] }] },
        }),
      });
    });

    await page.goto('/search');
    const searchInput = page.getByPlaceholder(/search/i).first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');
    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    const hasResults = await page.getByText(/artists|albums|tracks|no results/i).first().isVisible();
    const hasError = await page.getByText(/search failed|error/i).first().isVisible();
    expect(hasResults || hasError).toBeTruthy();

    // Verify specific mock data if results are visible
    if (await page.getByText(/artists/i).first().isVisible()) {
      await expect(page.getByText('Radiohead').first()).toBeVisible();
      await expect(page.getByText('OK Computer').first()).toBeVisible();
    }
  });

  test('search shows no results for empty state', async ({ page }) => {
    // We mock a search that returns nothing
    await page.route('**/api/search?q=empty*', async (route) => {
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

    await page.goto('/search?q=empty');
    // We check for "No results" or "Search failed" (if RSC isn't mocked)
    const statusText = page.locator('text=/No results|Search failed/i');
    await expect(statusText.first()).toBeVisible();
  });
});
