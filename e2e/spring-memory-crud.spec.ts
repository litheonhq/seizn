/**
 * Spring Memory CRUD E2E Test
 *
 * Full lifecycle test: API key → Create → Read → Search → Update → Delete
 *
 * Prerequisites:
 *   - SEIZN_E2E_API_KEY env variable set
 *   - SEIZN_E2E_BASE_URL env variable (defaults to http://localhost:3000)
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.SEIZN_E2E_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.SEIZN_E2E_API_KEY || '';

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  'Content-Type': 'application/json',
};

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  params?: Record<string, string>
) {
  let url = `${BASE_URL}/api${path}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json();
  return { status: response.status, data };
}

test.describe('Spring Memory CRUD Lifecycle', () => {
  let memoryId: string;
  let secondMemoryId: string;

  test.skip(!API_KEY, 'SEIZN_E2E_API_KEY not set');

  test('1. Add a memory', async () => {
    const { status, data } = await apiRequest('POST', '/memories', {
      content: 'E2E test: User prefers dark mode for coding',
      memory_type: 'preference',
      tags: ['e2e-test', 'preferences'],
      namespace: 'e2e-test',
    });

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.memory).toBeDefined();
    expect(data.memory.content).toContain('dark mode');

    memoryId = data.memory.id;
  });

  test('2. Add a second memory for search', async () => {
    const { status, data } = await apiRequest('POST', '/memories', {
      content: 'E2E test: User works with TypeScript and React',
      memory_type: 'fact',
      tags: ['e2e-test', 'tech-stack'],
      namespace: 'e2e-test',
    });

    expect(status).toBe(200);
    secondMemoryId = data.memory.id;
  });

  test('3. Get memory by ID', async () => {
    const { status, data } = await apiRequest('GET', `/memories/${memoryId}`);

    expect(status).toBe(200);
    expect(data.memory.id).toBe(memoryId);
    expect(data.memory.content).toContain('dark mode');
  });

  test('4. Search memories', async () => {
    // Wait a bit for embedding to be generated
    await new Promise((r) => setTimeout(r, 2000));

    const { status, data } = await apiRequest('GET', '/memories', undefined, {
      query: 'programming preferences',
      mode: 'vector',
      limit: '10',
      namespace: 'e2e-test',
    });

    expect(status).toBe(200);
    expect(data.results).toBeDefined();
    expect(data.results.length).toBeGreaterThan(0);
  });

  test('5. Update memory', async () => {
    const { status, data } = await apiRequest('PUT', `/memories/${memoryId}`, {
      tags: ['e2e-test', 'preferences', 'updated'],
      importance: 8,
    });

    expect(status).toBe(200);
    expect(data.memory.tags).toContain('updated');
  });

  test('6. Get temporal status', async () => {
    const { status, data } = await apiRequest('GET', '/spring/temporal/status');

    expect(status).toBe(200);
    expect(data.success).toBe(true);
    expect(typeof data.active).toBe('number');
    expect(typeof data.expired).toBe('number');
  });

  test('7. Delete first memory', async () => {
    const { status, data } = await apiRequest('DELETE', `/memories?ids=${memoryId}`);

    expect(status).toBe(200);
    expect(data.deleted).toBeTruthy();
  });

  test('8. Delete second memory', async () => {
    const { status, data } = await apiRequest('DELETE', `/memories?ids=${secondMemoryId}`);

    expect(status).toBe(200);
    expect(data.deleted).toBeTruthy();
  });

  test('9. Verify deletion', async () => {
    const { status } = await apiRequest('GET', `/memories/${memoryId}`);
    expect(status).toBe(404);
  });
});
