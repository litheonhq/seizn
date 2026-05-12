import { test, expect, type Page } from '@playwright/test';

/**
 * Timeline Smoke Test (Unauthenticated)
 *
 * /dashboard/author?tab=timeline is gated by the dashboard auth flow.
 * This smoke catches render regressions on the route itself — the actual
 * cursor / grouping logic is covered by unit tests under
 * src/__tests__/dashboard/redesign/timeline/ and src/__tests__/author/audit/.
 */

async function expectLoginGateOrRedirect(page: Page) {
  const path = '/dashboard/author?tab=timeline';
  await page.goto(path, { waitUntil: 'domcontentloaded' });

  const signInCopy = page.getByText(/Sign in to your account/i).first();
  const loginRequired = page.getByText(/Login required/i).first();

  const waiters = [
    page.waitForURL(/\/(login|signin)\b/i, { timeout: 7000 }),
    signInCopy.waitFor({ state: 'visible', timeout: 7000 }),
    loginRequired.waitFor({ state: 'visible', timeout: 7000 }),
  ];

  await Promise.any(waiters);

  if (await signInCopy.isVisible()) return;
  if (await loginRequired.isVisible()) return;
  await expect(page).toHaveURL(/\/(login|signin)/i);
}

test.describe('Author Timeline smoke', () => {
  test('renders the auth gate without crashing the route', async ({ page }) => {
    await expectLoginGateOrRedirect(page);
  });
});
