import { test, expect, type Page } from '@playwright/test';

/**
 * Coach Smoke Test (Unauthenticated)
 *
 * The new Author Coach surface lives at /dashboard/author?tab=coach.
 * This unauthenticated smoke catches render regressions on the route
 * itself — actual analyze/LLM behavior is covered by the unit/integration
 * suites at src/lib/author/coach/__tests__/*.
 */

async function expectLoginGateOrRedirect(page: Page) {
  const path = '/dashboard/author?tab=coach';
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

test.describe('Author Coach smoke', () => {
  test('renders the auth gate without crashing the route', async ({ page }) => {
    await expectLoginGateOrRedirect(page);
  });
});
