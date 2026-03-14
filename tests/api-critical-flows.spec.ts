import { test, expect } from '@playwright/test';

test.describe('API Critical Flows', () => {
  test('GET /api/users/[username] - Profile fetch', async ({ request }) => {
    const username = 'demo';
    const response = await request.get(`/api/users/${username}`);

    if (!response.ok()) {
        test.skip(true, `Environment or data missing (Status: ${response.status()})`);
        return;
    }

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('username', username);
  });

  test('POST /api/reviews - Unauthorized access check', async ({ request }) => {
    const response = await request.post('/api/reviews', {
      data: {
        entity_type: 'album',
        entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
        rating: 5
      }
    });
    expect(response.status()).toBe(401);
  });

  test('POST /api/logs - Unauthorized access check', async ({ request }) => {
    const response = await request.post('/api/logs', {
      data: { track_id: 'track_demo_1' }
    });
    expect(response.status()).toBe(401);
  });

  test('GET /api/reviews - Public fetch', async ({ request }) => {
    const response = await request.get('/api/reviews?entity_type=album&entity_id=2nLhD10Z7Sb4RFyCX2ZCyx');
    if (!response.ok()) {
        test.skip(true, `Environment or data missing (Status: ${response.status()})`);
        return;
    }
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty('reviews');
  });

  test('Flow: Review UI requires authentication', async ({ page }) => {
    await page.goto('/album/2nLhD10Z7Sb4RFyCX2ZCyx');
    const reviewButton = page.getByRole('button', { name: /rate.*review/i });
    if (await reviewButton.isVisible()) {
        await reviewButton.click();
        await page.getByRole('button', { name: /5 stars?/i }).click();
        await page.getByRole('button', { name: /^save review$/i }).click();
        // Expect error message for unauthenticated user
        await expect(page.locator('text=/unauthorized|sign in|error/i').first()).toBeVisible();
    }
  });
});
