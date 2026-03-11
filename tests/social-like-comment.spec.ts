import { test, expect } from '@playwright/test';

// End-to-end like + comment interaction using the /e2e/social harness.

test.describe('Like and comment', () => {
  test('like toggles and comment posts when authenticated', async ({ page }) => {
    // Mock NextAuth session so the comment form is visible.
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 'user_demo_1', name: 'Alice', email: 'alice@example.com', username: 'alice' },
          expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      });
    });

    await page.route('**/api/likes', async (route) => {
      if (route.request().method() === 'POST' || route.request().method() === 'DELETE') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
        return;
      }
      await route.fallback();
    });

    await page.route('**/api/comments?log_id=*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    });

    await page.route('**/api/comments', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON?.() as any;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'comment_1',
          log_id: body?.log_id ?? 'log_demo_1',
          content: body?.content ?? 'Nice',
          created_at: new Date().toISOString(),
          user: { id: 'user_demo_1', username: 'alice', avatar_url: null },
        }),
      });
    });

    await page.goto('/e2e/social');

    // Like button starts at ♡ 0, becomes ♥ 1.
    const likeButton = page.locator('button').filter({ hasText: /♡\s*0|♥\s*0/ }).first();
    await expect(likeButton).toContainText(/0/);
    await likeButton.click();
    await expect(likeButton).toContainText(/1/);

    // Open comments, post a comment.
    const commentButton = page.locator('button').filter({ hasText: /💬/ }).first();
    await commentButton.click();
    await expect(page.getByText(/no comments yet/i)).toBeVisible();

    await page.getByPlaceholder('Add a comment...').fill('Hello!');
    await page.getByRole('button', { name: /^post$/i }).click();
    await expect(page.getByText('Hello!')).toBeVisible();
  });
});

