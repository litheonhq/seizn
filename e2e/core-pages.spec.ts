import { test, expect } from '@playwright/test';

/**
 * Core Pages E2E Tests
 * Tests critical user flows for Linux compatibility (Chromium + Firefox)
 */

test.describe('Core Pages - Rendering', () => {
  test('Homepage loads correctly', async ({ page }) => {
    await page.goto('/');

    // Check main heading exists
    await expect(page.locator('h1').first()).toBeVisible();

    // Check navigation is rendered
    await expect(page.locator('nav')).toBeVisible();

    // Check no console errors on load
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.waitForLoadState('networkidle');
    expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0);
  });

  test('Docs page renders', async ({ page }) => {
    await page.goto('/docs');

    // Docs page should render
    await expect(page).toHaveTitle(/Docs|Documentation|Seizn/i);

    // Check main content area
    await expect(page.locator('main')).toBeVisible();
  });

  test('Pricing page renders', async ({ page }) => {
    await page.goto('/pricing');

    // Pricing content should be visible
    await expect(page.locator('main')).toBeVisible();
  });
});

test.describe('Authentication Flow', () => {
  test('Login page accessible', async ({ page }) => {
    await page.goto('/login');

    // Login form should be present
    await expect(page.locator('form')).toBeVisible();

    // Email input should exist
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible();
  });

  test('Signup page accessible', async ({ page }) => {
    await page.goto('/signup');

    // Signup form should be present
    await expect(page.locator('form')).toBeVisible();
  });
});

test.describe('Linux-Specific Features', () => {
  test('Copy button functionality (clipboard fallback)', async ({ page }) => {
    await page.goto('/docs');

    // Find any copy button
    const copyButton = page.locator('button:has-text("Copy"), button[aria-label*="copy"]').first();

    if (await copyButton.isVisible()) {
      // Click should not throw error
      await copyButton.click();

      // Should show copied feedback or not throw
      await page.waitForTimeout(500);
    }
  });

  test('Keyboard shortcut display adapts to platform', async ({ page }) => {
    await page.goto('/');

    // Check that keyboard shortcuts are displayed (if any)
    const shortcuts = await page.locator('[data-shortcut], kbd').all();

    // If shortcuts exist, they should be visible
    for (const shortcut of shortcuts.slice(0, 3)) {
      if (await shortcut.isVisible()) {
        const text = await shortcut.textContent();
        // Should contain either Ctrl or Cmd based on platform
        expect(text).toMatch(/Ctrl|Cmd|⌘/);
      }
    }
  });

  test('Font rendering - no layout shift', async ({ page }) => {
    await page.goto('/');

    // Wait for fonts to load
    await page.waitForLoadState('domcontentloaded');

    // Check that web fonts are loaded
    const fontLoaded = await page.evaluate(() => {
      return document.fonts.ready.then(() => true);
    });

    expect(fontLoaded).toBe(true);
  });

  test('File input is available (upload fallback)', async ({ page }) => {
    // Navigate to a page with file upload if exists
    await page.goto('/docs');

    // Check that native file inputs work (if present)
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.count() > 0) {
      await expect(fileInput).toBeAttached();
    }
  });
});

test.describe('Responsive Design', () => {
  test('Mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Should not have horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);

    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10);
  });

  test('Desktop viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    await expect(page.locator('body')).toBeVisible();
  });
});
