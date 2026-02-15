import { test, expect } from '@playwright/test';

/**
 * Dashboard Smoke Tests (Authenticated)
 *
 * If TEST_USER_EMAIL / TEST_USER_PASSWORD are provided, the tests use them.
 * Otherwise, the suite provisions a temporary user via `/api/auth/signup`.
 *
 * Note: if Turnstile is enabled in your local `.env.local`, you likely want:
 * `PLAYWRIGHT_DISABLE_TURNSTILE=1 PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test e2e/dashboard-auth-smoke.spec.ts --project=chromium`
 * Intended to validate the primary click-through pages for Enterprise/Organizations/Autopilot/Webhooks/Settings.
 */

test.describe('Dashboard Smoke (Authenticated)', () => {
  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = process.env.TEST_USER_EMAIL || `e2e+${runId}@example.com`;
  const password = process.env.TEST_USER_PASSWORD || `E2E!${runId}Aa`;

  test.beforeAll(async ({ request }) => {
    if (hasCreds) return;

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

    const paths = [
      '/dashboard/enterprise',
      '/dashboard/organizations',
      '/dashboard/autopilot',
      '/dashboard/webhooks',
      '/dashboard/settings',
    ] as const;

    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');

      if (path === '/dashboard/enterprise') {
        // Enterprise page isn't wrapped in DashboardShell in all cases.
        await expect(page.getByRole('heading', { name: /Enterprise/i }).first()).toBeVisible();
      } else {
        await expect(page.locator('main')).toBeVisible();
      }
    }

    // Best-effort: if an org detail link exists, ensure its "Invites" tab is reachable.
    await page.goto('/dashboard/organizations');
    const orgLink = page.locator('a[href^="/dashboard/organizations/"]').first();
    if (await orgLink.count()) {
      await orgLink.click();
      await page.waitForLoadState('domcontentloaded');

      // Some org pages render tabs; if "Invites" exists, it should be clickable.
      const invitesTab = page.getByRole('button', { name: /Invites/i }).first();
      if (await invitesTab.count()) {
        await invitesTab.click();
        await expect(page.locator('main')).toBeVisible();
      }
    }
  });
});
