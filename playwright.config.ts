import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const disableTurnstile = process.env.PLAYWRIGHT_DISABLE_TURNSTILE === '1';
let devPort = '3000';
try {
  devPort = new URL(baseURL).port || '3000';
} catch {
  // Keep default if PLAYWRIGHT_BASE_URL is malformed.
}

/**
 * Playwright E2E Test Configuration
 * Supports Linux/macOS/Windows with Chromium and Firefox
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    process.env.CI ? ['github'] : ['list'],
  ],

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // Desktop Chromium - Primary (Windows/macOS/Linux)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    // Desktop Firefox - Required for Linux compatibility
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // Desktop Safari - Best effort (macOS only)
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // Mobile Chrome
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },

    // Mobile Safari
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // Local development server
  webServer: process.env.CI ? undefined : {
    command: `npm run dev -- --port ${devPort}`,
    url: baseURL,
    // When disabling Turnstile, we must start a fresh server with the overridden env.
    reuseExistingServer: !process.env.CI && !disableTurnstile,
    timeout: 120 * 1000,
    env: disableTurnstile
      ? {
          // Ensure Next.js does not load the values from `.env.local` (dotenv does not override existing keys).
          TURNSTILE_SECRET_KEY: '',
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
        }
      : undefined,
  },
});
