import { test, expect } from '@playwright/test';

/**
 * Dashboard Smoke Tests (Authenticated)
 *
 * These tests are skipped unless TEST_USER_EMAIL / TEST_USER_PASSWORD are provided.
 * Intended to validate the primary click-through pages for Enterprise/Organizations/Autopilot/Webhooks/Settings.
 */

test.describe('Dashboard Smoke (Authenticated)', () => {
  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  test.skip(!hasCreds, 'Requires TEST_USER_EMAIL and TEST_USER_PASSWORD');

  test('Authenticated user can open key dashboard pages', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL!);
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD!);
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
