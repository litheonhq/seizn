import { defineConfig, devices } from '@playwright/test';
import fs from 'fs';
import path from 'path';

function loadLocalEnvFile(): Record<string, string> {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return {};

  const content = fs.readFileSync(envPath, 'utf8');
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIndex = line.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

const localEnv = loadLocalEnvFile();
const forceEnvFromLocal = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SEIZN_E2E_API_KEY',
] as const;

for (const key of forceEnvFromLocal) {
  if (localEnv[key]) {
    process.env[key] = localEnv[key];
  }
}

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const disableTurnstile = process.env.PLAYWRIGHT_DISABLE_TURNSTILE === '1';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === '1';
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
    // Default to an isolated server to avoid attaching to another local project.
    reuseExistingServer: !process.env.CI && reuseExistingServer && !disableTurnstile,
    timeout: 120 * 1000,
    env: {
      ...process.env,
      NEXT_PUBLIC_E2E_MODE: 'true',
      ...(disableTurnstile
        ? {
            // Force-disable Turnstile in local E2E runs.
            TURNSTILE_SECRET_KEY: '',
            NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
          }
        : {}),
    },
  },
});
