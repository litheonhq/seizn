import { test, expect } from '@playwright/test';

test.describe('Dashboard Organization Switcher', () => {
  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  const allowAutoProvision =
    process.env.PLAYWRIGHT_DISABLE_TURNSTILE === '1' || process.env.E2E_ALLOW_AUTO_PROVISION === '1';

  test.skip(
    !hasCreds && !allowAutoProvision,
    'Requires TEST_USER_EMAIL/TEST_USER_PASSWORD (or enable auto-provision with PLAYWRIGHT_DISABLE_TURNSTILE=1)'
  );

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = process.env.TEST_USER_EMAIL || `e2e+org-switch-${runId}@example.com`;
  const password = process.env.TEST_USER_PASSWORD || `E2E!${runId}Aa`;
  const organizationName = `Org Switch ${runId.slice(-6)}`;
  const organizationSlug = `org-switch-${runId.toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;

  test.beforeAll(async ({ request }) => {
    if (hasCreds || !allowAutoProvision) return;

    const res = await request.post('/api/auth/signup', {
      data: {
        email,
        password,
        name: 'E2E Org Switch User',
      },
    });

    if (!res.ok()) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Failed to provision e2e user via /api/auth/signup (status ${res.status()}): ${body}`
      );
    }
  });

  test('authenticated user can persist active organization changes from the top bar', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);

    const organization = await page.evaluate(
      async ({ name, slug }) => {
        const response = await fetch('/api/organizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, slug }),
        });

        const data = await response.json();
        if (!response.ok || !data.success || !data.organization?.id) {
          throw new Error(data?.error || 'Failed to create organization');
        }

        window.dispatchEvent(
          new CustomEvent('seizn:organizations-changed', {
            detail: { organization: data.organization },
          })
        );
        return data.organization as { id: string; name: string; slug: string };
      },
      { name: organizationName, slug: organizationSlug }
    );

    const switcherButton = page.getByTestId('org-switcher-button');
    await expect(switcherButton).toBeVisible();

    const switcherLabel = (await switcherButton.textContent()) ?? '';
    if (switcherLabel.includes(organization.name)) {
      const resetToPersonalResponse = page.waitForResponse((response) => {
        return (
          response.url().includes('/api/profile/organization') &&
          response.request().method() === 'PATCH'
        );
      });

      await switcherButton.click();
      await page.getByTestId('org-option-personal').click();
      expect((await resetToPersonalResponse).ok()).toBe(true);
      await expect(switcherButton).toContainText(/personal/i);

      const stateAfterReset = await page.evaluate(async () => {
        const [profileResponse, dashboardOrganizationsResponse] = await Promise.all([
          fetch('/api/profile/organization'),
          fetch('/api/dashboard/organizations'),
        ]);

        return {
          profile: await profileResponse.json(),
          dashboardOrganizations: await dashboardOrganizationsResponse.json(),
        };
      });

      expect(stateAfterReset.profile).toEqual({
        success: true,
        organizationId: null,
        organization: null,
      });
      expect(stateAfterReset.dashboardOrganizations).toMatchObject({
        success: true,
        activeOrganizationId: null,
      });
    }

    await expect(switcherButton).toContainText(/personal/i);
    await switcherButton.click();
    await expect(page.getByTestId(`org-option-${organization.id}`)).toBeVisible();

    const switchToOrganizationRequest = page.waitForRequest((request) => {
      return (
        request.url().includes('/api/profile/organization') &&
        request.method() === 'PATCH'
      );
    });
    const switchToOrganizationResponse = page.waitForResponse((response) => {
      return (
        response.url().includes('/api/profile/organization') &&
        response.request().method() === 'PATCH'
      );
    });

    await page.getByTestId(`org-option-${organization.id}`).click();
    expect((await switchToOrganizationRequest).method()).toBe('PATCH');
    expect((await switchToOrganizationResponse).ok()).toBe(true);
    await expect(switcherButton).toContainText(organization.name);

    const activeOrganizationAfterSwitch = await page.evaluate(async () => {
      const response = await fetch('/api/profile/organization');
      return response.json();
    });

    expect(activeOrganizationAfterSwitch).toMatchObject({
      success: true,
      organizationId: organization.id,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
    });

    const switchToPersonalRequest = page.waitForRequest((request) => {
      return (
        request.url().includes('/api/profile/organization') &&
        request.method() === 'PATCH'
      );
    });
    const switchToPersonalResponse = page.waitForResponse((response) => {
      return (
        response.url().includes('/api/profile/organization') &&
        response.request().method() === 'PATCH'
      );
    });

    await switcherButton.click();
    await page.getByTestId('org-option-personal').click();
    expect((await switchToPersonalRequest).method()).toBe('PATCH');
    expect((await switchToPersonalResponse).ok()).toBe(true);
    await expect(switcherButton).toContainText(/personal/i);

    const activeOrganizationAfterReset = await page.evaluate(async () => {
      const response = await fetch('/api/profile/organization');
      return response.json();
    });

    expect(activeOrganizationAfterReset).toEqual({
      success: true,
      organizationId: null,
      organization: null,
    });
  });
});
