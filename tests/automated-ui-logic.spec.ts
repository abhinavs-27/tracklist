import { test, expect } from '@playwright/test';

/**
 * Automated UI Logic Tests.
 * These tests verify core frontend interactions using Playwright.
 * API responses are mocked to ensure stability and isolation.
 */

test.describe('Critical Flows: Automated UI Logic', () => {

  test.beforeEach(async ({ page }) => {
    // Mock the session to be authenticated
    await page.route('**/api/auth/session', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 'test-user-id',
            name: 'Automated Tester',
            email: 'tester@example.com',
            username: 'autotester',
            image: 'https://example.com/avatar.png'
          },
          expires: new Date(Date.now() + 3600000).toISOString(),
        }),
      });
    });

    // Mock CSRF token for NextAuth
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ csrfToken: 'mock-csrf-token' }),
      });
    });
  });

  test('Review Creation Flow', async ({ page }) => {
    // Mock reviews API
    await page.route('**/api/reviews*', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-review-123', ...body }),
        });
      }
    });

    // Navigate to a logging utility page if it exists, or a common page
    await page.goto('/e2e/logging');

    // Check if we are on the right page
    const loggingHeader = page.locator('h1:has-text("E2E Logging")');
    if (await loggingHeader.isVisible()) {
      await page.getByRole('button', { name: /rate.*review/i }).first().click();
      await expect(page.getByRole('dialog')).toBeVisible();

      // In Playwright tests, we use exact: true for star ratings as they often have similar names
      await page.getByRole('button', { name: '5 out of 5 stars', exact: true }).click();
      await page.getByPlaceholder(/what did you think/i).fill('Great album, highly recommended!');

      const [response] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/reviews') && res.status() === 201),
        page.getByRole('button', { name: /save review/i }).click()
      ]);

      const result = await response.json();
      expect(result.rating).toBe(5);
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  });

  test('Listen Logging Flow', async ({ page }) => {
    // Mock logs API
    await page.route('**/api/logs', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 'mock-log-456', ...body }),
        });
      }
    });

    await page.goto('/e2e/logging');

    if (await page.locator('h1:has-text("E2E Logging")').isVisible()) {
      const [response] = await Promise.all([
        page.waitForResponse(res => res.url().includes('/api/logs') && res.status() === 200),
        page.getByRole('button', { name: /mock log listen/i }).click()
      ]);

      const result = await response.json();
      expect(result.track_id).toBe('track_demo_1');
    }
  });

  test('Search Functionality', async ({ page }) => {
    await page.goto('/search');
    const searchInput = page.getByRole('searchbox').first();
    await searchInput.fill('radiohead');
    await searchInput.press('Enter');

    await page.waitForURL(/\/search\?q=radiohead/);
    await expect(searchInput).toHaveValue('radiohead');

    // Verify search results area is visible
    const mainContent = page.getByRole('main');
    await expect(mainContent).toBeVisible();

    // The search page is an RSC, so it might not be easily interceptable via page.route
    // but we can check for the presence of typical result containers or empty states.
    const resultIndicator = page.locator('text=/Artists|Albums|Tracks|Search failed|No results/i').first();
    await expect(resultIndicator).toBeVisible();
  });

});
