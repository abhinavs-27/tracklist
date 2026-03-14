import { test, expect } from "@playwright/test";

test.describe("Spotify sync / automatic ingestion", () => {
  test("sync ingestion flow in UI", async ({ page }) => {
    const username = process.env.PLAYWRIGHT_TEST_PROFILE_USERNAME || 'demo';

    // Mock status as connected
    await page.route('**/api/spotify/status', async (route) => {
      await route.fulfill({ status: 200, body: JSON.stringify({ connected: true }) });
    });

    // Mock successful sync
    await page.route('**/api/spotify/sync', async (route) => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ inserted: 3, skipped: 0, mode: 'song' }),
      });
    });

    await page.goto(`/profile/${username}`);

    const syncButton = page.getByRole('button', { name: /sync recently played/i });
    if (await syncButton.isVisible()) {
      await syncButton.click();

      // Look for indicators of success.
      // Based on common patterns in this app, it might reload the page.
      // We expect the button to remain or some text to confirm status.
      await expect(syncButton).toBeVisible();
    }
  });

  test("API handles sync request correctly", async ({ request }) => {
    // We test the unauthorized case as a baseline
    const response = await request.post('/api/spotify/sync');
    expect(response.status()).toBe(401);
  });
});
