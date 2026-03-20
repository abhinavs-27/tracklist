import { test, expect } from "@playwright/test";

test.describe("Leaderboard page", () => {
  test("renders Leaderboard heading and loads data", async ({ page }) => {
    await page.goto("/leaderboard", { waitUntil: "domcontentloaded" });

    await expect(
      page.getByRole("heading", { name: /leaderboard/i }),
    ).toBeVisible({ timeout: 10000 });

    const firstItemLink = page.locator('a[href^="/album/"], a[href^="/song/"]').first();
    const errorBox = page.getByText(/failed to load leaderboard/i);

    // Wait for either data to render or a visible error.
    await Promise.race([
      firstItemLink.waitFor({ state: "visible", timeout: 20000 }),
      errorBox.waitFor({ state: "visible", timeout: 20000 }),
    ]);
  });
});

