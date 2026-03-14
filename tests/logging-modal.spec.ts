import { test, expect } from '@playwright/test';

type ReviewPostBody = {
  entity_type?: 'album' | 'song';
  entity_id?: string;
  rating?: number;
  review_text?: string | null;
};

test.describe('Review modal (album/track)', () => {
  test('album review modal submits to /api/reviews', async ({ page }) => {
    await page.addInitScript(() => {
      window.location.reload = () => {};
    });

    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON?.() as ReviewPostBody | undefined;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'review_created_1',
          user_id: 'user_demo_1',
          entity_type: body?.entity_type ?? 'album',
          entity_id: body?.entity_id ?? '2nLhD10Z7Sb4RFyCX2ZCyx',
          rating: body?.rating ?? 3,
          review_text: body?.review_text ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    });

    await page.goto('/e2e/logging');

    await page.getByRole('button', { name: /rate.*review/i }).first().click();
    await expect(page.getByRole('heading', { name: /rate.*review/i })).toBeVisible();

    await page.getByRole('button', { name: /5 stars?/i }).click();
    await page.getByRole('button', { name: /^save review$/i }).click();

    const req = await page.waitForRequest((r) => r.url().includes('/api/reviews') && r.method() === 'POST');
    const posted = req.postDataJSON() as ReviewPostBody;
    expect(posted.entity_type).toBe('album');
    expect(posted.entity_id).toBe('2nLhD10Z7Sb4RFyCX2ZCyx');
    expect(posted.rating).toBe(5);
  });

  test('track review modal submits to /api/reviews', async ({ page }) => {
    await page.addInitScript(() => {
      window.location.reload = () => {};
    });

    await page.route('**/api/reviews', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'review_created_2' }),
      });
    });

    await page.goto('/e2e/logging');

    await page.getByRole('button', { name: /rate.*review/i }).nth(1).click();
    await expect(page.getByText(/demo track/i)).toBeVisible();

    await page.getByRole('button', { name: /4 stars?/i }).click();
    await page.getByRole('button', { name: /^save review$/i }).click();

    const req = await page.waitForRequest((r) => r.url().includes('/api/reviews') && r.method() === 'POST');
    const posted = req.postDataJSON() as ReviewPostBody;
    expect(posted.entity_type).toBe('song');
    expect(posted.entity_id).toBe('track_demo_1');
    expect(posted.rating).toBe(4);
  });
});
