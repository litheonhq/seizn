import { describe, expect, it, vi } from 'vitest';

import { createVerificationBlock, deriveKey, generateSaltBase64 } from './encryption';
import { SecureMemoryClient } from './secure-memory-client';

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('SecureMemoryClient', () => {
  it('unlock returns not_setup when profile has no E2E material', async () => {
    const client = new SecureMemoryClient();

    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { hasSetup: false, e2e_salt: null, e2e_verification_block: null, e2e_setup_at: null } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await client.unlock('1234');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('not_setup');
  });

  it('unlock derives key, verifies block, and can decrypt', async () => {
    const client = new SecureMemoryClient();

    const salt = generateSaltBase64();
    const key = await deriveKey('1234', salt);
    const block = await createVerificationBlock(key);

    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { hasSetup: true, e2e_salt: salt, e2e_verification_block: block, e2e_setup_at: '2026-02-15T00:00:00.000Z' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const unlockRes = await client.unlock('1234');
    expect(unlockRes.ok).toBe(true);
    expect(client.isUnlocked).toBe(true);

    const encrypted = await client.encryptForStorage('secret');
    const decrypted = await client.decryptFromStorage(encrypted);
    expect(decrypted).toBe('secret');
  });

  it('wrong PIN triggers cooldown after 3 attempts', async () => {
    const client = new SecureMemoryClient();

    const salt = generateSaltBase64();
    const key = await deriveKey('1234', salt);
    const block = await createVerificationBlock(key);

    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { success: true, data: { hasSetup: true, e2e_salt: salt, e2e_verification_block: block, e2e_setup_at: '2026-02-15T00:00:00.000Z' } })
    );
    vi.stubGlobal('fetch', fetchMock);

    const r1 = await client.unlock('9999');
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.reason).toBe('wrong_pin');

    const r2 = await client.unlock('9999');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.reason).toBe('wrong_pin');

    const r3 = await client.unlock('9999');
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.reason).toBe('cooldown');
  });
});

