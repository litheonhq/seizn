import { expect, test } from '@playwright/test';

test.describe('Track 2 API keys dashboard', () => {
  const hasCreds = Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
  const allowAutoProvision =
    process.env.PLAYWRIGHT_DISABLE_TURNSTILE === '1' || process.env.E2E_ALLOW_AUTO_PROVISION === '1';
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = process.env.TEST_USER_EMAIL || `e2e+track2-key-${runId}@example.com`;
  const password = process.env.TEST_USER_PASSWORD || `E2E!Track2${runId}Aa`;

  test.skip(
    !hasCreds && !allowAutoProvision,
    'Requires TEST_USER_EMAIL/TEST_USER_PASSWORD (or enable auto-provision with PLAYWRIGHT_DISABLE_TURNSTILE=1)'
  );

  test.beforeAll(async ({ request }) => {
    if (hasCreds || !allowAutoProvision) return;

    const response = await request.post('/api/auth/signup', {
      data: {
        email,
        password,
        name: 'E2E Track 2 API Key User',
      },
    });

    if (!response.ok()) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Failed to provision e2e user via /api/auth/signup (status ${response.status()}): ${body}`
      );
    }
  });

  test('creates and revokes a key without surfacing HTML-as-JSON errors', async ({ page }) => {
    const clientErrors: string[] = [];
    page.on('pageerror', (error) => clientErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        clientErrors.push(message.text());
      }
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);

    await page.goto('/dashboard/account/api-keys');
    await expect(page.getByRole('heading', { name: /API\s*(keys|키)/i })).toBeVisible();

    const keyName = `E2E revoke ${runId}`;
    await page.getByRole('button', { name: /New API key|새 API 키/i }).click();
    await page.locator('form input[type="text"]').fill(keyName);
    await page.getByRole('button', { name: /Create|생성/i }).last().click();

    await expect(page.getByRole('heading', { name: /API key created|키.*생성/i })).toBeVisible();
    await expect(page.getByText(/Save it now|Save this key|저장/i).first()).toBeVisible();
    await page.getByRole('button', { name: /Done|완료/i }).click();

    const keyRow = page.locator('li').filter({ hasText: keyName });
    await expect(keyRow).toBeVisible();
    await keyRow.getByRole('button', { name: /Revoke|폐기/i }).click();

    const confirmDialog = page.getByRole('heading', { name: /Revoke|폐기/i });
    await expect(confirmDialog).toBeVisible();
    await page.getByRole('button', { name: /Revoke|폐기/i }).last().click();

    await expect(keyRow).toHaveCount(0);
    await expect(page.getByText(/Unexpected token|not valid JSON/i)).toHaveCount(0);
    expect(clientErrors.join('\n')).not.toMatch(/Unexpected token|not valid JSON/i);
  });
});
