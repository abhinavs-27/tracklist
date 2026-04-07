import { test, expect } from '@playwright/test';

const ALBUM_ID = '6o38CdD7CUlZDCFhjZYLDH';
const UNIQUE_REVIEW_TEXT = 'E2E instant update test ' + Date.now();

test.describe('Album review instant update', () => {
  test('submitting a review shows it in the list without page refresh', async ({ page }) => {
    test.skip(
      !(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      'Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to run this E2E.'
    );

    // Mock GET /api/reviews so the reviews section loads with empty data
    await page.route('**/api/reviews*', async (route) => {
      const url = route.request().url();
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            reviews: [],
            average_rating: null,
            count: 0,
            my_review: null,
          }),
        });
        return;
      }
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'e2e-review-' + Date.now(),
            user_id: 'e2e-user',
            username: 'E2E Tester',
            entity_type: body?.entity_type ?? 'album',
            entity_id: body?.entity_id ?? ALBUM_ID,
            rating: body?.rating ?? 5,
            review_text: body?.review_text ?? null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user: {
              id: 'e2e-user',
              username: 'E2E Tester',
              avatar_url: null,
            },
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto(`/album/${ALBUM_ID}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });

    // Scroll to Reviews section and wait for it
    const reviewsHeading = page.getByRole('heading', { name: /reviews/i });
    await reviewsHeading.scrollIntoViewIfNeeded();
    await expect(reviewsHeading).toBeVisible();

    // Use the inline "Add your review" form (always visible in Reviews section)
    const addReviewBtn = page.getByRole('button', { name: /add your review/i });
    await expect(addReviewBtn).toBeVisible();
    await addReviewBtn.click();

    // Fill form: 5 stars and our unique text
    await page.getByRole('button', { name: /5 out of 5 stars/i }).click();
    const textarea = page.getByPlaceholder(/what do you think/i);
    await textarea.fill(UNIQUE_REVIEW_TEXT);

    // Capture URL before submit to ensure we don't navigate/refresh
    const urlBefore = page.url();

    await page.getByRole('button', { name: /^save$/i }).click();

    // Modal closes / form closes; review should appear in the list without full page reload
    await expect(page.getByText(UNIQUE_REVIEW_TEXT)).toBeVisible({ timeout: 5000 });
    expect(page.url()).toBe(urlBefore);
  });
});
