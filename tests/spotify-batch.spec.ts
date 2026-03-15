import { test, expect } from "@playwright/test";

/**
 * Batch helpers (getOrFetchAlbumsBatch, getOrFetchTracksBatch, getOrFetchArtistsBatch)
 * are used by discover, feed, album, and recommended pages. They return arrays in input order,
 * use DB-first cache, then a single chunked Spotify API call for missing IDs.
 * These tests validate integration: pages that use batch helpers load and return data.
 */

test.describe("Spotify batch integration", () => {
  test("discover page loads and uses batch fetch for tracks and albums", async ({ page }) => {
    await page.goto("/discover");
    await expect(page).toHaveURL(/\/discover/);
    await expect(page.getByRole("heading", { name: /Discover/i })).toBeVisible({
      timeout: 15000,
    });
    const body = page.locator("body");
    const hasTrendingOrGems =
      (await body.getByText(/Trending|Hidden Gems|Rising/i).count()) > 0;
    expect(hasTrendingOrGems).toBe(true);
  });

  test("feed enrichment uses batch: feed page loads", async ({ page }) => {
    await page.goto("/feed");
    if ((await page.getByRole("button", { name: /sign in/i }).count()) > 0) {
      test.skip();
      return;
    }
    await expect(page).toHaveURL(/\/feed/);
    await expect(
      page.getByRole("heading", { name: /Feed/i }).or(page.getByText(/Your feed is empty/i)),
    ).toBeVisible({ timeout: 10000 });
  });

  test("recommended page uses getOrFetchAlbumsBatch", async ({ page }) => {
    await page.goto("/discover/recommended");
    if ((await page.getByRole("button", { name: /sign in/i }).count()) > 0) {
      test.skip();
      return;
    }
    await expect(page).toHaveURL(/\/discover\/recommended/);
    await expect(
      page.getByRole("heading", { name: /Recommended for you/i }).or(page.getByText(/Log some albums/i)),
    ).toBeVisible({ timeout: 10000 });
  });
});
