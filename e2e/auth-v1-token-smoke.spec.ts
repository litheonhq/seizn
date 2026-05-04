import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'fs';
import path from 'path';

const authRoutes = [
  { path: '/login', title: 'Sign in to your account', primary: 'Sign In' },
  { path: '/signup', title: 'Create your account', primary: 'Create Account' },
  { path: '/device', title: 'Authorize Device', primary: 'Verify Code' },
] as const;

const viewports = [
  { width: 360, height: 740 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 },
] as const;

test.describe('Auth V1 token migration smoke', () => {
  test('source stays on shared auth shell and has no legacy gradient/token classes', () => {
    const files = [
      'src/components/auth/auth-shell.tsx',
      'src/app/(auth)/layout.tsx',
      'src/app/(auth)/login/page.tsx',
      'src/app/(auth)/login/login-form.tsx',
      'src/app/(auth)/signup/page.tsx',
      'src/app/(auth)/signup/signup-form.tsx',
      'src/app/(auth)/device/page.tsx',
      'src/app/(auth)/device/device-form.tsx',
    ];
    const content = files.map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n');

    expect(content).toContain('SeiznLockup');
    expect(content).toContain('AuthLoadingShell');
    expect(content).toContain('AuthPage');
    expect(content).toContain('role="alert"');
    expect(content).toContain('aria-live');
    expect(content).not.toMatch(/from-violet-|from-purple-|via-purple-|to-cyan-|bg-cyan-|bg-violet-|bg-purple-/);
    expect(content).not.toMatch(/szn-text-|szn-card|szn-border|szn-surface|gradient-hero|btn-premium/);
    expect(content).not.toMatch(/text-purple-|text-red-|bg-red-|border-red-|bg-gray-900/);
    expect(content).not.toMatch(/style=\{\{/);
  });

  for (const route of authRoutes) {
    for (const viewport of viewports) {
      test(`${route.path} renders without horizontal overflow at ${viewport.width}px`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(route.path);

        await expect(page.getByRole('heading', { name: route.title })).toBeVisible();
        await expect(page.getByRole('button', { name: route.primary })).toBeVisible();
        await expect(page.getByLabel('Seizn home')).toBeVisible();

        const overflow = await page.evaluate(() => {
          const documentWidth = Math.max(
            document.documentElement.scrollWidth,
            document.body.scrollWidth
          );
          return documentWidth - window.innerWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);

        const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
        expect(bodyFont).toContain('Pretendard');
      });
    }
  }

  test('login and signup expose stable keyboard tab order', async ({ page }) => {
    await page.goto('/login');
    const loginStops = await collectTabStops(page, 6);
    expect(loginStops.join(' | ')).toContain('Seizn home');
    expect(loginStops.join(' | ')).toContain('Continue with GitHub');
    expect(loginStops.join(' | ')).toContain('login-email');
    expect(loginStops.join(' | ')).toContain('login-password');

    await page.goto('/signup');
    const signupStops = await collectTabStops(page, 7);
    expect(signupStops.join(' | ')).toContain('Seizn home');
    expect(signupStops.join(' | ')).toContain('Continue with GitHub');
    expect(signupStops.join(' | ')).toContain('signup-name');
    expect(signupStops.join(' | ')).toContain('signup-email');
  });

  test('device code input keeps keyboard focus and formats pasted code', async ({ page }) => {
    await page.goto('/device');

    const input = page.getByPlaceholder('ABCD-1234');
    await expect(input).toBeFocused();
    await input.fill('abcd1234');
    await expect(input).toHaveValue('ABCD-1234');
  });

  test('signup validation announces errors and moves focus to status', async ({ page }) => {
    await page.goto('/signup');

    await page.getByLabel('Email').fill('tester@example.com');
    await page.getByLabel('Password', { exact: true }).fill('correct-horse');
    await page.getByLabel('Confirm Password').fill('wrong-horse');
    await page.getByRole('button', { name: 'Create Account' }).click();

    const alert = page.getByRole('alert').filter({ hasText: 'Passwords do not match' });
    await expect(alert).toBeVisible();
    await expect(alert).toBeFocused();
  });

  test('auth pages have no serious or critical axe violations', async ({ page }) => {
    for (const route of authRoutes) {
      await page.goto(route.path);
      const results = await new AxeBuilder({ page }).analyze();
      const severe = results.violations.filter((violation) =>
        violation.impact === 'serious' || violation.impact === 'critical'
      );
      expect(severe, `${route.path}: ${severe.map((violation) => violation.id).join(', ')}`).toEqual([]);
    }
  });
});

async function collectTabStops(page: Page, count: number) {
  const stops: string[] = [];
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return '';
      return [
        active.getAttribute('aria-label'),
        active.id,
        active.getAttribute('name'),
        active.textContent?.trim(),
        active.getAttribute('placeholder'),
        active.tagName.toLowerCase(),
      ].find(Boolean) ?? '';
    }));
  }
  return stops;
}
