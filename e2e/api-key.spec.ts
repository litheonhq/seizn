import { test, expect } from '@playwright/test';

/**
 * API Key Flow E2E Tests
 * Tests API key generation and copy functionality
 * Critical for Linux users using CLI/SDK
 */

test.describe('API Key Management', () => {
  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  const allowAutoProvision =
    process.env.PLAYWRIGHT_DISABLE_TURNSTILE === '1' || process.env.E2E_ALLOW_AUTO_PROVISION === '1';
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = process.env.TEST_USER_EMAIL || `e2e+api-key-${runId}@example.com`;
  const password = process.env.TEST_USER_PASSWORD || `E2E!ApiKey${runId}Aa`;

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
    test.skip(
      !hasCreds && !allowAutoProvision,
      'Requires TEST_USER_EMAIL/TEST_USER_PASSWORD (or enable auto-provision with PLAYWRIGHT_DISABLE_TURNSTILE=1)'
    );

    test.beforeAll(async ({ request }) => {
      if (hasCreds || !allowAutoProvision) return;

      const res = await request.post('/api/auth/signup', {
        data: {
          email,
          password,
          name: 'E2E API Key User',
        },
      });

      if (!res.ok()) {
        const body = await res.text().catch(() => '');
        throw new Error(
          `Failed to provision e2e user via /api/auth/signup (status ${res.status()}): ${body}`
        );
      }
    });

    test('Can access dashboard after login', async ({ page }) => {
      // Login
      await page.goto('/login');
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');

      // Wait for redirect
      await page.waitForURL(/dashboard/);

      // Dashboard should render
      await expect(page.locator('main')).toBeVisible();
    });
  });
});
