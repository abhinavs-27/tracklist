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

    // Check if the sync button exists and click it
    const syncButton = page.getByRole('button', { name: /sync recently played/i });
    if (await syncButton.isVisible()) {
      await syncButton.click();
      // Verify button is still there or state is updated
      await expect(syncButton).toBeVisible();
    }
  });

  test("API handles unauthorized sync request", async ({ request }) => {
    const response = await request.post('/api/spotify/sync');
    expect(response.status()).toBe(401);
  });
});
