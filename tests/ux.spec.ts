import { test, expect } from '@playwright/test';

const ALBUM_ID = '2nLhD10Z7Sb4RFyCX2ZCyx';
const hasSpotifyEnv = !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);

test.describe('UX improvements', () => {
  test('album page loads and shows engagement stats', async ({ page }) => {
    test.skip(!hasSpotifyEnv, 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run album UX E2E.');
    await page.goto(`/album/${ALBUM_ID}`);
    await expect(page).toHaveURL(new RegExp(`/album/${ALBUM_ID}`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    const body = page.locator('body');
    const hasStats =
      (await body.getByText(/average rating/i).count()) > 0 ||
      (await body.getByText(/\d+ listen/i).count()) > 0 ||
      (await body.getByText(/\d+ review/i).count()) > 0 ||
      (await body.getByText(/No listens or reviews yet/i).count()) > 0;
    expect(hasStats).toBe(true);
  });

  test('friend activity section or placeholder on album page', async ({ page }) => {
    test.skip(!hasSpotifyEnv, 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run album UX E2E.');
    await page.goto(`/album/${ALBUM_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    const friendsHeading = page.getByRole('heading', { name: /Friends who listened/i });
    const hasReviews = page.getByRole('heading', { name: /Reviews/i });
    await expect(friendsHeading.or(hasReviews).first()).toBeVisible({ timeout: 5000 });
  });

  test('feed empty state shows helpful message', async ({ page }) => {
    await page.goto('/feed');
    if ((await page.getByRole('button', { name: /sign in/i }).count()) > 0) {
      test.skip();
      return;
    }
    const emptyFeed = page.getByText(/Your feed is empty/i);
    const hasCta = page.getByRole('link', { name: /Find people to follow/i });
    const emptyOrHasContent = (await emptyFeed.count()) > 0 || (await page.locator('ul').filter({ has: page.locator('li') }).count()) > 0;
    expect(emptyOrHasContent).toBe(true);
    if (await emptyFeed.isVisible()) {
      await expect(hasCta).toBeVisible();
    }
  });

  test('lists empty state shows correct message on own profile', async ({ page }) => {
    await page.goto('/');
    const signIn = page.getByRole('button', { name: /sign in/i });
    if (await signIn.isVisible()) {
      test.skip();
      return;
    }
    const profileLink = page.getByRole('link', { name: /profile/i });
    if (!(await profileLink.isVisible())) {
      test.skip();
      return;
    }
    await profileLink.click();
    await expect(page).toHaveURL(/\/profile\//);
    const emptyListsMessage = page.getByText(/You haven't created any lists yet|No lists yet/i);
    const hasListLinks = (await page.locator('a[href*="/lists/"]').count()) > 0;
    const hasEmptyOrLists = (await emptyListsMessage.count()) > 0 || hasListLinks;
    expect(hasEmptyOrLists).toBe(true);
  });

  test('album reviews empty state shows correct message', async ({ page }) => {
    test.skip(!hasSpotifyEnv, 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run album UX E2E.');
    await page.goto(`/album/${ALBUM_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    const reviewsHeading = page.getByRole('heading', { name: /Reviews/i });
    await expect(reviewsHeading).toBeVisible({ timeout: 5000 });
    const emptyReviews = page.getByText(/No reviews yet\. Be the first to review this album/i);
    const hasReviewCards = (await page.getByRole('article').count()) > 0;
    const hasEmptyMessage = await emptyReviews.isVisible();
    expect(hasReviewCards || hasEmptyMessage).toBe(true);
  });

  test('relative timestamps render when content exists', async ({ page }) => {
    test.skip(!hasSpotifyEnv, 'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run album UX E2E.');
    await page.goto(`/album/${ALBUM_ID}`);
    await expect(page).toHaveURL(new RegExp(`/album/${ALBUM_ID}`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10000 });
    const body = page.locator('body');
    const hasRelative =
      (await body.getByText(/\d+m ago/i).count()) > 0 ||
      (await body.getByText(/\d+h ago/i).count()) > 0 ||
      (await body.getByText(/\d+ days? ago/i).count()) > 0 ||
      (await body.getByText(/Yesterday/i).count()) > 0 ||
      (await body.getByText(/just now/i).count()) > 0;
    const noActivity = (await body.getByText(/No listens or reviews yet|No reviews yet/i).count()) > 0;
    expect(hasRelative || noActivity).toBe(true);
  });
});
