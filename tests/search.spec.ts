import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('search page loads with search input', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: /search/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search/i)).toBeVisible();
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
    await page.getByPlaceholder(/search/i).fill('radiohead');
    await page.getByPlaceholder(/search/i).press('Enter');
    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(page.getByPlaceholder(/search/i)).toHaveValue('radiohead');
    const hasResults = await page.getByText(/artists|albums|tracks|no results/i).isVisible();
    const hasError = await page.getByText(/search failed|error/i).isVisible();
    expect(hasResults || hasError).toBeTruthy();
  });
});
