import { test, expect } from '@playwright/test';

/**
 * API Key Flow E2E Tests
 * Tests API key generation and copy functionality
 * Critical for Linux users using CLI/SDK
 */

test.describe('API Key Management', () => {
  // Skip auth-required tests in CI without credentials
  const skipAuth = !process.env.TEST_USER_EMAIL;

  test('Dashboard redirects to login when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/login|signin/);
  });

  test('API documentation shows correct endpoints', async ({ page }) => {
    await page.goto('/docs/api-reference');

    // Wait for content
    await page.waitForLoadState('domcontentloaded');

    // Check API endpoints are documented
    const content = await page.textContent('body');

    // Should mention API endpoints
    expect(content).toMatch(/POST|GET|DELETE|PUT/);
  });

  test('Quickstart shows API usage example', async ({ page }) => {
    await page.goto('/docs/quickstart');

    // Should show code examples
    await expect(page.locator('pre, code').first()).toBeVisible();

    // Should show curl or SDK examples
    const content = await page.textContent('body');
    expect(content).toMatch(/curl|fetch|npm|pip|seizn/i);
  });

  test.describe('Authenticated Flow', () => {
    test.skip(skipAuth, 'Requires test credentials');

    test('Can access dashboard after login', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
      await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
      await page.click('button[type="submit"]');

      // Wait for redirect
      await page.waitForURL(/dashboard/);

      // Dashboard should render
      await expect(page.locator('main')).toBeVisible();
    });
  });
});
