import { test, expect, type Page } from '@playwright/test';

/**
 * Dashboard Smoke Tests (Unauthenticated)
 *
 * These pages are expected to either:
 * - redirect to /login, or
 * - render a "Login required" gate
 *
 * This protects against regressions where dashboard routes crash on render
 * (Next.js route errors, React child errors, missing providers, etc).
 */

const DASHBOARD_PATHS = [
  '/dashboard/settings',
  '/dashboard/billing',
  '/dashboard/author/settings',
  '/dashboard/usage',
  '/dashboard/account/api-keys',
  '/dashboard/account/api-keys/audit',
] as const;

async function expectLoginGateOrRedirect(path: string, page: Page) {
  // baseURL is configured in playwright.config.ts so we can use relative paths.
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  // Many dashboard routes redirect or gate access. Allow any of these outcomes.
  const signInCopy = page.getByText(/Sign in to your account/i).first();
  const loginRequired = page.getByText(/Login required/i).first();

  const waiters = [
    page.waitForURL(/\/(login|signin)\b/i, { timeout: 7000 }),
    signInCopy.waitFor({ state: 'visible', timeout: 7000 }),
    loginRequired.waitFor({ state: 'visible', timeout: 7000 }),
  ];

  await Promise.any(waiters);

  // Assert final state (avoid brittle URL assumptions).
  if (await signInCopy.isVisible()) return;
  if (await loginRequired.isVisible()) return;

  const pathname = new URL(page.url()).pathname;
  if (pathname.startsWith('/login') || pathname.startsWith('/signin')) {
    await expect(page.getByText(/Sign in/i).first()).toBeVisible();
    return;
  }

  throw new Error(`Unexpected dashboard outcome for ${path}: ${page.url()}`);
}

test.describe('Dashboard Smoke (Unauthenticated)', () => {
  for (const path of DASHBOARD_PATHS) {
    test(`${path} renders login gate or redirects`, async ({ page }) => {
      await expectLoginGateOrRedirect(path, page);
    });
  }
});
