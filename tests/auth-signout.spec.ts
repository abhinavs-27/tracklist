import { test, expect } from '@playwright/test';

test.describe('Authentication (sign out)', () => {
  test('navbar shows sign out when authenticated and clicking it returns to signed-out UI', async ({ page }) => {
    // NextAuth client reads session from this endpoint.
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'user_demo_1',
            name: 'Alice',
            email: 'alice@example.com',
            username: 'alice',
            image: null,
          },
          expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      });
    });

    // NextAuth will call signout endpoints; we stub them to avoid CSRF/cookie coupling.
    await page.route('**/api/auth/signout', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/' }) });
    });
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'csrf_demo' }) });
    });

    await page.goto('/');

    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();

    const signoutReq = page.waitForRequest((r) => r.url().includes('/api/auth/signout'));
    await page.getByRole('button', { name: /sign out/i }).click();
    await signoutReq;

    // After sign-out, we simulate unauthenticated state by switching the session response.
    await page.unroute('**/api/auth/session');
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });

    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  });
});

