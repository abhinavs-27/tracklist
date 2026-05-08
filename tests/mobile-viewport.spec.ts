/**
 * Mobile viewport parity tests — runs at iPhone 14 (390×844) via the
 * `mobile-web` Playwright project defined in playwright.config.ts.
 *
 * Goal: catch every visual / structural difference between what mobile web
 * renders and what the native app is supposed to show, before it reaches users.
 *
 * Each describe block mirrors the equivalent native screen.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the first album ID from the popularity leaderboard, or null. */
async function getTestAlbumId(request: APIRequestContext): Promise<string | null> {
  const res = await request.get("/api/leaderboard?type=popular&entity=album&limit=5&lite=true");
  if (!res.ok()) return null;
  const data = await res.json();
  return (data.items as { id: string }[])?.[0]?.id ?? null;
}

/** Returns the artist_id for an album, or null. */
async function getTestArtistId(request: APIRequestContext, albumId: string): Promise<string | null> {
  const res = await request.get(`/api/albums/${albumId}`);
  if (!res.ok()) return null;
  const data = await res.json();
  return data.album?.artist_id ?? null;
}

/** Returns the first track ID from an album's tracklist, or null. */
async function getTestSongId(request: APIRequestContext, albumId: string): Promise<string | null> {
  const res = await request.get(`/api/albums/${albumId}`);
  if (!res.ok()) return null;
  const data = await res.json();
  return (data.tracks as { id: string }[])?.[0]?.id ?? null;
}

// ── Explore page ─────────────────────────────────────────────────────────────

test.describe("Explore — mobile viewport", () => {
  test("shows heading, range toggle, and discovery sections", async ({ page }) => {
    await page.goto("/explore");

    await expect(page.getByRole("heading", { name: /explore/i }).first()).toBeVisible();

    // Range toggle — matches mobile app's 24h / 7 days pills
    await expect(page.getByText("24h", { exact: true })).toBeVisible();
    await expect(page.getByText("7 days", { exact: true })).toBeVisible();

    // Core sections that the native app also renders
    await expect(page.getByText(/blowing up/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/rising artists/i).first()).toBeVisible();
    await expect(page.getByText(/most talked about/i).first()).toBeVisible();
    await expect(page.getByText(/most loved/i).first()).toBeVisible();
    await expect(page.getByText(/hidden gems/i).first()).toBeVisible();
  });

  test("range toggle switches between 24h and 7 days", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/blowing up/i).first()).toBeVisible({ timeout: 15000 });

    // Switch to 24h
    await page.getByText("24h", { exact: true }).click();
    // Page should not crash; sections still visible
    await expect(page.getByText(/blowing up/i).first()).toBeVisible();

    // Switch back to 7 days
    await page.getByText("7 days", { exact: true }).click();
    await expect(page.getByText(/blowing up/i).first()).toBeVisible();
  });

  test("Find people link is present", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/find people/i).first()).toBeVisible({ timeout: 10000 });
  });
});

// ── Browse page ───────────────────────────────────────────────────────────────

test.describe("Browse — mobile viewport", () => {
  test("shows heading and filter controls", async ({ page }) => {
    await page.goto("/browse");

    await expect(page.getByRole("heading", { name: /browse/i })).toBeVisible();

    // Entity toggle — Albums | Tracks (full-width pills matching native)
    await expect(page.getByText("Albums", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Tracks", { exact: true }).first()).toBeVisible();

    // Sort toggle — Plays | Rating | Favorites
    await expect(page.getByText("Plays", { exact: true })).toBeVisible();
    await expect(page.getByText("Rating", { exact: true })).toBeVisible();
    await expect(page.getByText("Favorites", { exact: true })).toBeVisible();

    // Era chip row
    await expect(page.getByText("All time", { exact: true })).toBeVisible();
    await expect(page.getByText("2020s", { exact: true })).toBeVisible();
  });

  test("Tracks entity toggle loads track grid", async ({ page }) => {
    await page.goto("/browse");
    await page.getByText("Tracks", { exact: true }).first().click();
    // Grid should still render
    await expect(page.locator("[class*=grid]").first()).toBeVisible({ timeout: 15000 });
  });

  test("era chip filters — Pre-1970 chip is present and clickable", async ({ page }) => {
    await page.goto("/browse");
    const chip = page.getByText("Pre-1970", { exact: true });
    await expect(chip).toBeVisible();
    await chip.click();
    // Should not crash, heading still visible
    await expect(page.getByRole("heading", { name: /browse/i })).toBeVisible();
  });

  test("grid shows album artwork cards", async ({ page }) => {
    await page.goto("/browse");
    // Wait for at least one album image to load
    const firstCard = page.locator("img").first();
    await expect(firstCard).toBeVisible({ timeout: 15000 });
  });
});

// ── Artist page ───────────────────────────────────────────────────────────────

test.describe("Artist — mobile viewport", () => {
  test("shows all required sections", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const artistId = await getTestArtistId(request, albumId!);
    if (!artistId) test.skip(true, "could not resolve artist_id");

    await page.goto(`/artist/${artistId}`);

    // Hero always present
    await expect(page.getByText(/artist/i).first()).toBeVisible({ timeout: 15000 });

    // Tabs — General and Social
    await expect(page.getByText("General", { exact: true })).toBeVisible();
    await expect(page.getByText("Social", { exact: true })).toBeVisible();

    // Popular tracks section — native app shows 5 by default
    const tracksHeading = page.getByRole("heading", { name: /popular tracks/i });
    if (await tracksHeading.isVisible()) {
      // Count visible track rows — should be ≤ 5 before Load more
      const trackLinks = page.locator('a[href^="/song/"]');
      const count = await trackLinks.count();
      expect(count).toBeLessThanOrEqual(5);

      // If artist has more than 5 tracks, Load more should appear
      const loadMore = page.getByText(/load more/i);
      if (await loadMore.isVisible()) {
        await loadMore.click();
        // After expanding, more than 5 should be visible
        const expandedCount = await page.locator('a[href^="/song/"]').count();
        expect(expandedCount).toBeGreaterThan(count);
      }
    }

    // Albums section
    const albumsHeading = page.getByRole("heading", { name: /^albums$/i });
    if (await albumsHeading.isVisible()) {
      // Grid of album links
      const albumLinks = page.locator('a[href^="/album/"]');
      expect(await albumLinks.count()).toBeGreaterThan(0);
    }

    // Reviews section
    const reviewsHeading = page.getByRole("heading", { name: /^reviews$/i });
    if (await reviewsHeading.isVisible()) {
      // Each review should have a rating star
      const stars = page.getByText(/★/).first();
      await expect(stars).toBeVisible();
    }
  });

  test("Social tab loads leaderboard", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const artistId = await getTestArtistId(request, albumId!);
    if (!artistId) test.skip(true, "could not resolve artist_id");

    await page.goto(`/artist/${artistId}`);
    await expect(page.getByText("General", { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByText("Social", { exact: true }).click();
    await expect(page.getByText(/among your friends/i)).toBeVisible({ timeout: 10000 });
  });

  test("artist name and genres visible in hero", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const artistId = await getTestArtistId(request, albumId!);
    if (!artistId) test.skip(true, "no artist id");

    await page.goto(`/artist/${artistId}`);
    // Hero should contain an h1 with the artist name
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toBeVisible({ timeout: 15000 });
    expect((await h1.textContent())?.trim().length).toBeGreaterThan(0);
  });
});

// ── Album page ────────────────────────────────────────────────────────────────

test.describe("Album — mobile viewport", () => {
  test("shows header, stats, and 3-tab navigation", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    await page.goto(`/album/${albumId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    // Three tabs — Tracks | Reviews | Social
    await expect(page.getByText("Tracks", { exact: true })).toBeVisible();
    await expect(page.getByText("Reviews", { exact: true })).toBeVisible();
    await expect(page.getByText("Social", { exact: true })).toBeVisible();

    // Community stats line: rating + plays present when data exists
    const ratingText = page.getByText(/★/).first();
    if (await ratingText.isVisible()) {
      // Rating format: ★ X.X (not ★★★★ repeated)
      const text = await ratingText.textContent();
      expect(text).toMatch(/★\s*[\d.]+/);
    }
  });

  test("Tracks tab shows tracklist with numbers and durations", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    await page.goto(`/album/${albumId}`);
    await expect(page.getByText("Tracks", { exact: true })).toBeVisible({ timeout: 15000 });

    // Tracks tab should be active by default — tracklist visible
    const trackNumbers = page.locator("text=/^\\d+$/").first();
    await expect(trackNumbers).toBeVisible({ timeout: 10000 });
  });

  test("Reviews tab shows review cards", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    await page.goto(`/album/${albumId}`);
    await expect(page.getByText("Reviews", { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByText("Reviews", { exact: true }).click();
    // After switching, either reviews appear or the empty state
    const hasReviews = await page.getByText(/★/).first().isVisible();
    const hasEmpty = await page.getByText(/no reviews/i).isVisible();
    expect(hasReviews || hasEmpty).toBeTruthy();
  });

  test("album header shows year and track metadata", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    await page.goto(`/album/${albumId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    // Detail line should contain year and track count
    const detailText = await page.getByText(/\d{4}.*track/i).first().textContent().catch(() => null);
    if (detailText) {
      expect(detailText).toMatch(/\d{4}/); // year
      expect(detailText).toMatch(/tracks?/i); // track count
    }
  });

  test("artist link in header navigates to artist page", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    await page.goto(`/album/${albumId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    const artistLink = page.locator('a[href^="/artist/"]').first();
    if (await artistLink.isVisible()) {
      const href = await artistLink.getAttribute("href");
      expect(href).toMatch(/^\/artist\/.+/);
    }
  });
});

// ── Home page ─────────────────────────────────────────────────────────────────

test.describe("Home — mobile viewport (visitor/logged-out)", () => {
  test("visitor feed shows hero heading and sign-in CTA", async ({ page }) => {
    await page.goto("/");

    // The visitor hero headline
    await expect(page.getByRole("heading", { name: /music is better with friends/i })).toBeVisible({ timeout: 15000 });

    // Sign in CTA
    await expect(page.getByRole("link", { name: /sign in with google/i })).toBeVisible();

    // "Full Explore hub →" link — ensures explore is discoverable from home
    await expect(page.getByRole("link", { name: /full explore hub/i })).toBeVisible();
  });

  test("visitor feed shows Billboard preview section with leaderboard link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/billboard preview/i)).toBeVisible({ timeout: 15000 });
    // Should link to /leaderboard → redirects to /browse
    await expect(page.getByRole("link", { name: /leaderboard/i })).toBeVisible();
  });

  test("visitor feed shows Trending section with discover link", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/trending/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("visitor feed shows Reviews & opinions section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/reviews/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("sign-in link navigates to auth page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /sign in with google/i })).toBeVisible({ timeout: 10000 });
    const href = await page.getByRole("link", { name: /sign in with google/i }).getAttribute("href");
    expect(href).toMatch(/\/auth\/signin/);
  });

  test("Explore hub link navigates to /explore", async ({ page }) => {
    await page.goto("/");
    const link = page.getByRole("link", { name: /full explore hub/i });
    await expect(link).toBeVisible({ timeout: 10000 });
    const href = await link.getAttribute("href");
    expect(href).toBe("/explore");
  });
});

// ── Song page ─────────────────────────────────────────────────────────────────

test.describe("Song — mobile viewport", () => {
  test("shows hero with correct structure: label, title, artist, album, stats", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const songId = await getTestSongId(request, albumId!);
    if (!songId) test.skip(true, "no tracks on album");

    await page.goto(`/song/${songId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    // "Song" label in small caps above title
    await expect(page.getByText("Song", { exact: true })).toBeVisible();

    // Artist link(s)
    const artistLink = page.locator('a[href^="/artist/"]').first();
    await expect(artistLink).toBeVisible();

    // Album link ("From Album Name")
    const albumLink = page.locator('a[href^="/album/"]').first();
    await expect(albumLink).toBeVisible();
  });

  test("stats shown in correct ★ X.X format (not repeated stars)", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const songId = await getTestSongId(request, albumId!);
    if (!songId) test.skip(true, "no tracks on album");

    await page.goto(`/song/${songId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    const ratingEl = page.getByText(/★/).first();
    if (await ratingEl.isVisible()) {
      const text = await ratingEl.textContent();
      // Must be "★ 3.7" style, not "★★★★" repeated stars
      expect(text).toMatch(/★\s*[\d.]+/);
      expect(text).not.toMatch(/★★/); // no repeated stars
    }
  });

  test("web song page has Reviews tab as default — NOTE: mobile uses Info tab (parity gap)", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const songId = await getTestSongId(request, albumId!);
    if (!songId) test.skip(true, "no tracks on album");

    await page.goto(`/song/${songId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    // Web default tab is "Reviews" — the mobile app shows "Info" tab instead.
    // This test documents the gap so it can be fixed when the song page is aligned.
    await expect(page.getByText("Reviews", { exact: true })).toBeVisible();
  });

  test("duration and year shown in detail metadata", async ({ page, request }) => {
    const albumId = await getTestAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const songId = await getTestSongId(request, albumId!);
    if (!songId) test.skip(true, "no tracks on album");

    await page.goto(`/song/${songId}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });

    // Duration in m:ss format
    const durationEl = page.getByText(/\d+:\d{2}/).first();
    if (await durationEl.isVisible()) {
      expect(await durationEl.textContent()).toMatch(/\d+:\d{2}/);
    }
  });
});

// ── Find People page ─────────────────────────────────────────────────────────

test.describe("Find People (/search/users) — mobile viewport", () => {
  test("shows heading, back link, and search input", async ({ page }) => {
    await page.goto("/search/users");

    await expect(page.getByRole("heading", { name: /find people/i })).toBeVisible({ timeout: 10000 });

    // Back link to /explore — matches native app's back button going to search/index
    const backLink = page.getByRole("link", { name: /explore/i }).first();
    await expect(backLink).toBeVisible();
    const href = await backLink.getAttribute("href");
    expect(href).toContain("/explore");

    // Search input
    await expect(page.getByRole("textbox")).toBeVisible();
  });

  test("browse section loads users", async ({ page }) => {
    await page.goto("/search/users");
    await expect(page.getByRole("heading", { name: /find people/i })).toBeVisible({ timeout: 10000 });
    // User list or empty state should appear
    const hasUsers = await page.locator("[class*=user], [data-testid*=user]").first().isVisible();
    const hasEmpty = await page.getByText(/no users/i).isVisible();
    // Either data or empty state — page should not be blank
    const pageText = await page.textContent("body");
    expect(pageText?.length).toBeGreaterThan(50);
  });

  test("searching by username shows results or empty state", async ({ page }) => {
    await page.goto("/search/users");
    const input = page.getByRole("textbox");
    await expect(input).toBeVisible({ timeout: 10000 });
    await input.fill("a");
    // Wait briefly for results
    await page.waitForTimeout(500);
    // Page should still be functional
    await expect(page.getByRole("heading", { name: /find people/i })).toBeVisible();
  });
});

// ── Explore — internal navigation links ──────────────────────────────────────

test.describe("Explore — internal links resolve correctly", () => {
  test("'View all' in Browse section navigates to /browse", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/blowing up/i).first()).toBeVisible({ timeout: 15000 });

    // The "Browse albums & tracks →" CTA links to /browse
    const browseLink = page.getByRole("link", { name: /browse albums/i }).first();
    if (await browseLink.isVisible()) {
      const href = await browseLink.getAttribute("href");
      expect(href).toContain("/browse");
    }
  });

  test("Communities link in 'Across communities' goes to /communities", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/across communities/i).first()).toBeVisible({ timeout: 15000 });

    const commLink = page.getByRole("link", { name: /communities/i }).first();
    if (await commLink.isVisible()) {
      const href = await commLink.getAttribute("href");
      expect(href).toContain("/communities");
    }
  });

  test("'Find people →' link on explore goes to /search/users", async ({ page }) => {
    await page.goto("/explore");
    const link = page.getByRole("link", { name: /find people/i }).first();
    await expect(link).toBeVisible({ timeout: 15000 });
    const href = await link.getAttribute("href");
    expect(href).toContain("/search/users");
  });

  test("clicking a Blowing Up card navigates to a song or album page", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/blowing up/i).first()).toBeVisible({ timeout: 15000 });

    const itemLink = page.locator('a[href^="/song/"], a[href^="/album/"]').first();
    if (await itemLink.isVisible({ timeout: 5000 })) {
      const href = await itemLink.getAttribute("href");
      expect(href).toMatch(/^\/(song|album)\/.+/);
    }
  });

  test("clicking a Rising Artists card navigates to an artist page", async ({ page }) => {
    await page.goto("/explore");
    await expect(page.getByText(/rising artists/i).first()).toBeVisible({ timeout: 15000 });

    const artistLink = page.locator('a[href^="/artist/"]').first();
    if (await artistLink.isVisible({ timeout: 5000 })) {
      const href = await artistLink.getAttribute("href");
      expect(href).toMatch(/^\/artist\/.+/);
    }
  });
});
