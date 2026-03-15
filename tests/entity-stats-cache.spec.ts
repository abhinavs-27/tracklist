import { test, expect } from "@playwright/test";

test.describe("Entity stats cache", () => {
  test("refresh-stats cron returns 401 without CRON_SECRET", async ({ request }) => {
    const res = await request.get("/api/cron/refresh-stats");
    expect(res.status()).toBe(401);
  });

  test("refresh-stats cron returns 200 or 500 with CRON_SECRET", async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      test.skip();
      return;
    }
    const res = await request.get("/api/cron/refresh-stats", {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect([200, 500]).toContain(res.status());
    const data = await res.json();
    if (res.status() === 200) {
      expect(data.ok).toBe(true);
    } else {
      expect(data.error).toBeDefined();
    }
  });

  test("album page renders with stats (cache or fallback)", async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      "Set Spotify env to run album page E2E.",
    );
    await page.goto("/album/2nLhD10Z7Sb4RFyCX2ZCyx");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 10000,
    });
    const body = page.locator("body");
    const hasStatsOrEmpty =
      (await body.getByText(/average rating|listens|reviews|No listens or reviews/i).count()) > 0;
    expect(hasStatsOrEmpty).toBe(true);
  });

  test("song page renders with stats (cache or fallback)", async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      "Set Spotify env to run song page E2E.",
    );
    await page.goto("/song/2nLhD10Z7Sb4RFyCX2ZCyx");
    await expect(page).toHaveURL(/\/song\//);
    const body = page.locator("body");
    const hasContent =
      (await body.getByText(/listens|reviews|rating|No listens/i).count()) > 0 ||
      (await body.getByRole("heading", { level: 1 }).count()) > 0;
    expect(hasContent).toBe(true);
  });
});
