import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard Smoke Tests (Authenticated)
 *
 * If TEST_USER_EMAIL / TEST_USER_PASSWORD are provided, the tests use them.
 * Otherwise, the suite provisions a temporary user via `/api/auth/signup`.
 *
 * Note: if Turnstile is enabled in your local `.env.local`, you likely want:
 * `PLAYWRIGHT_DISABLE_TURNSTILE=1 PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test e2e/dashboard-auth-smoke.spec.ts --project=chromium`
 * Intended to validate the primary click-through pages for Settings/Billing/Usage/API Keys.
 */

test.describe('Dashboard Smoke (Authenticated)', () => {
  test.setTimeout(60_000);

  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  const allowAutoProvision =
    process.env.PLAYWRIGHT_DISABLE_TURNSTILE === '1' || process.env.E2E_ALLOW_AUTO_PROVISION === '1';

  test.skip(
    !hasCreds && !allowAutoProvision,
    'Requires TEST_USER_EMAIL/TEST_USER_PASSWORD (or enable auto-provision with PLAYWRIGHT_DISABLE_TURNSTILE=1)'
  );
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = process.env.TEST_USER_EMAIL || `e2e+${runId}@example.com`;
  const password = process.env.TEST_USER_PASSWORD || `E2E!${runId}Aa`;

  async function expectDashboardPageLoaded(page: Page) {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByText(/Runtime Error/i)).toHaveCount(0);
    await expect(page.getByText(/Page not found/i)).toHaveCount(0);
    expect(new URL(page.url()).pathname).not.toMatch(/^\/(?:login|signup)\b/);
  }

  test.beforeAll(async ({ request }) => {
    if (hasCreds || !allowAutoProvision) return;

    const res = await request.post('/api/auth/signup', {
      data: {
        email,
        password,
        name: 'E2E Smoke User',
      },
    });

    if (!res.ok()) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Failed to provision e2e user via /api/auth/signup (status ${res.status()}): ${body}`
      );
    }
  });

  test('Authenticated user can open key dashboard pages', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');

    // Wait for redirect into dashboard.
    await page.waitForURL(/dashboard/);
    await expectDashboardPageLoaded(page);

    const paths = [
      '/dashboard',
      '/dashboard/settings',
      '/dashboard/billing',
      '/dashboard/author/settings',
      '/dashboard/usage',
      '/dashboard/account/api-keys',
      '/dashboard/account/api-keys/audit',
      '/dashboard/memories',
      '/dashboard/keys',
    ] as const;

    for (const path of paths) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('domcontentloaded');
      await expectDashboardPageLoaded(page);

      if (path === '/dashboard/author/settings') {
        await page.getByRole('button', { name: /Manage Billing|결제 관리/i }).click();
        await page.waitForURL(/\/(?:en\/)?pricing\b/, { timeout: 10_000 });
      }
    }
  });
});
