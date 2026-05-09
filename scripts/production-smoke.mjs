import { spawnSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const smokeEnvPath = resolve(repoRoot, '.env.production.smoke.local');
const tempEnvPath = join(tmpdir(), `seizn-production-env-${process.pid}.tmp`);
const browserArtifactsDir = resolve(repoRoot, 'output', 'playwright');
const DEFAULT_SMOKE_EMAIL = 'smoke+production-dashboard@seizn.test';
const DEFAULT_SMOKE_NAME = 'Production Smoke Account';
const DEFAULT_SMOKE_KEY_NAME = 'Production Smoke Key';
const BROWSER_SMOKE_TIMEOUT_MS = 30_000;

function stripWrappingQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '').trim();
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return stripWrappingQuotes(value);
}

function maskEmail(email) {
  const [localPart, domain] = email.split('@');
  if (!domain) return email;
  const safeLocal =
    localPart.length <= 3 ? `${localPart[0] ?? '*'}**` : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
  return `${safeLocal}@${domain}`;
}

function generatePassword() {
  return `Smoke!${crypto.randomBytes(12).toString('base64url')}Aa1`;
}

function runVercelEnvPull() {
  const vercelBin = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const result = spawnSync(
    vercelBin,
    ['env', 'pull', tempEnvPath, '--environment=production', '--yes'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }
  );

  if (result.status !== 0) {
    const details =
      result.error?.message ||
      result.stderr ||
      result.stdout ||
      'Failed to pull Vercel production env';
    throw new Error(details);
  }
}

async function loadProductionEnv() {
  runVercelEnvPull();
  loadEnv({ path: tempEnvPath, override: true });
  await rm(tempEnvPath, { force: true });

  if (existsSync(smokeEnvPath)) {
    loadEnv({ path: smokeEnvPath, override: true });
  }
}

async function persistSmokeEnv(values) {
  const lines = [
    `TEST_USER_EMAIL=${values.email}`,
    `TEST_USER_PASSWORD=${values.password}`,
    `TEST_USER_NAME=${values.name}`,
    `TEST_USER_ID=${values.userId}`,
  ];

  await writeFile(smokeEnvPath, `${lines.join('\n')}\n`, 'utf8');
}

async function buildProfileUpsertPayloads(userId, email, name) {
  const localPart = email.split('@')[0] || 'user';
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'user';
  const shortId = userId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const fallbackHandle = `${normalized}_${shortId}`;
  const fallbackName = name.trim() || localPart || 'User';

  const minimalPayload = { id: userId, email };
  const profilePayload = {
    ...minimalPayload,
    full_name: fallbackName,
    name: fallbackName,
    plan: 'free',
    language: 'en',
  };

  return [
    minimalPayload,
    { ...minimalPayload, plan: 'free' },
    profilePayload,
    { ...profilePayload, handle: fallbackHandle, username: fallbackHandle },
    { ...profilePayload, handle: fallbackHandle, display_name: fallbackName, role: 'buyer' },
  ];
}

async function upsertProfileWithFallback(supabase, userId, email, name) {
  const payloads = await buildProfileUpsertPayloads(userId, email, name);
  let lastError = null;

  for (const payload of payloads) {
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
    if (!error) return;
    lastError = error;
  }

  throw lastError || new Error('Profile upsert failed');
}

async function findAuthUserByEmail(supabase, email) {
  const target = email.toLowerCase();
  const perPage = 200;

  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const matched = users.find((user) => user.email?.toLowerCase() === target);
    if (matched) {
      return matched;
    }

    if (users.length < perPage) {
      return null;
    }
  }

  return null;
}

async function ensureSmokeUser(supabase, email, password, name) {
  let user = await findAuthUserByEmail(supabase, email);
  let created = false;

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
      },
    });

    if (error) {
      throw error;
    }

    user = data.user;
    created = true;
  } else {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: name,
      },
    });

    if (error) {
      throw error;
    }

    user = data.user;
  }

  if (!user?.id) {
    throw new Error('Smoke user was not returned from Supabase admin');
  }

  await upsertProfileWithFallback(supabase, user.id, user.email || email, name);

  return {
    userId: user.id,
    created,
  };
}

async function createAccessToken(email, password) {
  const publicClient = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  const { data, error } = await publicClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session?.access_token) {
    throw error || new Error('Failed to sign in smoke user with Supabase');
  }

  return data.session.access_token;
}

async function requestJson(baseUrl, path, { method = 'GET', bearerToken, apiKey, body } = {}) {
  const headers = {};

  if (bearerToken) {
    headers.authorization = `Bearer ${bearerToken}`;
  }

  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  }

  if (body !== undefined && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(new URL(path, baseUrl), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;

  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }

  return {
    status: response.status,
    ok: response.ok,
    json,
  };
}

async function ensureSmokeKey(baseUrl, bearerToken) {
  const keysResponse = await requestJson(baseUrl, '/api/keys', { bearerToken });
  if (!keysResponse.ok) {
    throw new Error(`Failed to list API keys: ${keysResponse.status}`);
  }

  const keys = Array.isArray(keysResponse.json?.keys) ? keysResponse.json.keys : [];
  const existing = keys.filter((key) => key?.name === DEFAULT_SMOKE_KEY_NAME);

  for (const key of existing) {
    await requestJson(baseUrl, `/api/keys?id=${encodeURIComponent(key.id)}`, {
      method: 'DELETE',
      bearerToken,
    });
  }

  const createResponse = await requestJson(baseUrl, '/api/keys', {
    method: 'POST',
    bearerToken,
    body: { name: DEFAULT_SMOKE_KEY_NAME },
  });

  if (!createResponse.ok) {
    throw new Error(`Failed to create smoke key: ${createResponse.status}`);
  }

  return {
    action: existing.length > 0 ? 'rotated' : 'created',
    keyCount: Math.max(1, keys.length - existing.length + 1),
    apiKey: createResponse.json?.key,
  };
}

async function runBrowserSmoke(baseUrl, email, password, queryText) {
  await mkdir(browserArtifactsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  let page = null;

  try {
    const context = await browser.newContext();
    page = await context.newPage();
    await page.goto(new URL('/login', baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });

    if (await hasTurnstileChallenge(page)) return skippedBrowserSmokeResults();

    await page.locator('#login-email').fill(email, {
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.locator('#login-password').fill(password, {
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    if (await hasTurnstileChallenge(page)) return skippedBrowserSmokeResults();
    await page.getByRole('button', { name: /sign in/i }).click({
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.waitForURL(/dashboard/, { timeout: BROWSER_SMOKE_TIMEOUT_MS });

    await page.goto(new URL('/dashboard/playground', baseUrl).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.waitForURL(/dashboard\/playground/, { timeout: BROWSER_SMOKE_TIMEOUT_MS });
    await page.getByTestId('playground-query-input').fill(queryText, {
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.getByTestId('playground-namespace-input').fill('production-smoke', {
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.getByRole('button', { name: /keyword/i }).click({
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });

    const dashboardStats = await page.evaluate(async () => {
      const response = await fetch('/api/dashboard/stats');
      let body = null;

      try {
        body = await response.json();
      } catch {
        body = null;
      }

      return { status: response.status, body };
    });

    if (dashboardStats.status !== 200) {
      throw new Error(
        `Dashboard stats smoke failed: ${dashboardStats.status} ${JSON.stringify(dashboardStats.body)}`
      );
    }

    await page.getByTestId('playground-run-query').click({
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.getByTestId('playground-result-item').first().waitFor({
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });

    const resultText = (await page.getByTestId('playground-results-panel').textContent()) || '';
    if (!resultText.includes(queryText)) {
      throw new Error('Playground browser smoke did not render the expected query result');
    }

    await page.getByTestId('playground-tab-trace').click({
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });
    await page.getByTestId('playground-trace-latency').waitFor({
      timeout: BROWSER_SMOKE_TIMEOUT_MS,
    });

    await context.close();

    return [
      { path: '/login [POST credentials]', status: 200 },
      { path: '/dashboard/playground [GET session]', status: 200 },
      { path: '/api/dashboard/stats [GET session]', status: 200 },
      { path: '/dashboard/playground query [UI]', status: 200 },
      { path: '/dashboard/playground trace [UI]', status: 200 },
    ];
  } catch (error) {
    if (page) {
      const screenshotPath = resolve(browserArtifactsDir, 'production-smoke-browser-failure.png');
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});

      if (error instanceof Error) {
        error.message = `${error.message} (url: ${page.url()}, screenshot: ${screenshotPath})`;
      }
    }

    throw error;
  } finally {
    await browser.close();
  }
}

async function hasTurnstileChallenge(page) {
  const turnstileWidget = page.locator(
    [
      '.cf-turnstile',
      'iframe[src*="turnstile"]',
      'iframe[src*="challenges.cloudflare.com"]',
      'iframe[title*="Turnstile"]',
      'input[name="cf-turnstile-response"]',
    ].join(', ')
  );

  await page.waitForTimeout(750);
  return (await turnstileWidget.count()) > 0;
}

function skippedBrowserSmokeResults() {
  return [
    {
      path: '/login [browser session]',
      status: 'SKIPPED',
      detail: 'Turnstile challenge enforced',
    },
  ];
}

async function runSmoke(baseUrl, bearerToken, smokeEmail, smokePassword) {
  const results = [];
  let memoryId = null;
  let smokeApiKey = null;
  let capturedError = null;

  try {
    const keysGet = await requestJson(baseUrl, '/api/keys', { bearerToken });
    results.push({ path: '/api/keys [GET]', status: keysGet.status });
    if (!keysGet.ok) {
      throw new Error(`API keys GET smoke failed: ${keysGet.status} ${JSON.stringify(keysGet.json)}`);
    }

    const keyResult = await ensureSmokeKey(baseUrl, bearerToken);
    results.push({
      path: '/api/keys [POST]',
      status: 200,
      detail: keyResult.action,
    });

    if (!keyResult.apiKey) {
      throw new Error('Smoke API key was not returned');
    }
    smokeApiKey = keyResult.apiKey;

    const memoryContent = `production smoke ${new Date().toISOString()}`;
    const createMemory = await requestJson(baseUrl, '/api/v1/memories', {
      method: 'POST',
      apiKey: smokeApiKey,
      body: {
        content: memoryContent,
        memory_type: 'fact',
        namespace: 'production-smoke',
        tags: ['production-smoke'],
      },
    });
    results.push({ path: '/api/v1/memories [POST]', status: createMemory.status });
    if (!createMemory.ok) {
      throw new Error(
        `Memory create smoke failed: ${createMemory.status} ${JSON.stringify(createMemory.json)}`
      );
    }

    memoryId = createMemory.json?.data?.memory?.id || createMemory.json?.memory?.id;
    if (!memoryId) {
      throw new Error('Smoke memory id missing from create response');
    }

    const searchMemory = await requestJson(
      baseUrl,
      `/api/v1/memories?query=${encodeURIComponent(memoryContent)}&namespace=production-smoke&mode=keyword`,
      {
        apiKey: smokeApiKey,
      }
    );
    results.push({ path: '/api/v1/memories [GET]', status: searchMemory.status });
    if (!searchMemory.ok) {
      throw new Error(
        `Memory search smoke failed: ${searchMemory.status} ${JSON.stringify(searchMemory.json)}`
      );
    }

    const playgroundQuery = await requestJson(baseUrl, '/api/playground/query', {
      method: 'POST',
      bearerToken,
      body: {
        query: memoryContent,
        namespace: 'production-smoke',
        topK: 3,
        mode: 'keyword',
        rerank: false,
      },
    });
    results.push({ path: '/api/playground/query [POST]', status: playgroundQuery.status });
    if (!playgroundQuery.ok || playgroundQuery.json?.success !== true) {
      throw new Error(
        `Playground query smoke failed: ${playgroundQuery.status} ${JSON.stringify(playgroundQuery.json)}`
      );
    }

    const tracesList = await requestJson(baseUrl, '/api/traces?limit=1', {
      apiKey: smokeApiKey,
    });
    results.push({ path: '/api/traces [GET]', status: tracesList.status });
    if (!tracesList.ok) {
      throw new Error(
        `Traces list smoke failed: ${tracesList.status} ${JSON.stringify(tracesList.json)}`
      );
    }

    const browserResults = await runBrowserSmoke(baseUrl, smokeEmail, smokePassword, memoryContent);
    results.push(...browserResults);

    return results;
  } catch (error) {
    capturedError = error;
    throw error;
  } finally {
    if (memoryId && smokeApiKey) {
      const deleteMemory = await requestJson(
        baseUrl,
        `/api/v1/memories?ids=${encodeURIComponent(memoryId)}`,
        {
          method: 'DELETE',
          apiKey: smokeApiKey,
        }
      );
      results.push({ path: '/api/v1/memories [DELETE]', status: deleteMemory.status });
      if (!deleteMemory.ok && !capturedError) {
        throw new Error(
          `Memory delete smoke failed: ${deleteMemory.status} ${JSON.stringify(deleteMemory.json)}`
        );
      }
    }
  }
}

function printResults(summary) {
  console.log(`Production smoke user: ${maskEmail(summary.email)}`);
  console.log(`Smoke env file: ${smokeEnvPath}`);
  console.log(`User created this run: ${summary.created ? 'yes' : 'no'}`);
  console.log(`Auth mode: Supabase bearer + API key`);
  for (const result of summary.results) {
    const suffix = result.detail ? ` (${result.detail})` : '';
    console.log(`${result.path}: ${result.status}${suffix}`);
  }
}

async function main() {
  await loadProductionEnv();

  const supabaseUrl = requireEnv('SUPABASE_URL');
  requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseServiceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const nextAuthUrl = requireEnv('NEXTAUTH_URL');
  const smokeEmail = stripWrappingQuotes(process.env.TEST_USER_EMAIL || DEFAULT_SMOKE_EMAIL);
  const smokePassword = stripWrappingQuotes(process.env.TEST_USER_PASSWORD || generatePassword());
  const smokeName = stripWrappingQuotes(process.env.TEST_USER_NAME || DEFAULT_SMOKE_NAME);

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { userId, created } = await ensureSmokeUser(supabase, smokeEmail, smokePassword, smokeName);
  await persistSmokeEnv({
    email: smokeEmail,
    password: smokePassword,
    name: smokeName,
    userId,
  });

  const accessToken = await createAccessToken(smokeEmail, smokePassword);
  const results = await runSmoke(nextAuthUrl, accessToken, smokeEmail, smokePassword);
  printResults({
    email: smokeEmail,
    created,
    results,
  });
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  if (existsSync(tempEnvPath)) {
    await rm(tempEnvPath, { force: true });
  }
  process.exit(1);
});
