import { test, expect } from "@playwright/test";

test.describe("Taste match", () => {
  test("clicking button renders taste score", async ({ page }) => {
    await page.route("**/api/taste-match**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          score: 42,
          overlapScore: 50,
          genreOverlapScore: 30,
          discoveryScore: 65,
          sharedArtists: [
            {
              id: "a1",
              name: "Radiohead",
              imageUrl: null,
              listenCountUserA: 12,
              listenCountUserB: 8,
            },
          ],
          sharedGenres: [
            { name: "indie rock", weightUserA: 15, weightUserB: 12 },
          ],
          summary: "Somewhat similar — you share artists and some genre ground.",
          insufficientData: false,
        }),
      });
    });

    const username = process.env.PLAYWRIGHT_TEST_PROFILE_USERNAME;
    test.skip(
      !username,
      "Set PLAYWRIGHT_TEST_PROFILE_USERNAME to an existing username to run this test.",
    );
    await page.goto(`/profile/${username}`);

    const compareBtn = page.getByRole("button", { name: /compare taste/i });
    if (!(await compareBtn.isVisible().catch(() => false))) {
      test.skip(
        true,
        "Sign in and visit another user’s profile to see Compare taste (or use a logged-in storage state).",
      );
    }

    await compareBtn.click();

    await expect(page.getByTestId("taste-score")).toContainText("42");
  });
});
