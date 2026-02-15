import { describe, expect, it } from 'vitest';

import {
  createVerificationBlock,
  decrypt,
  deriveKey,
  encrypt,
  generateSaltBase64,
  verifyPin,
} from './encryption';

describe('E2E memory encryption', () => {
  it('encrypt -> decrypt roundtrip returns original plaintext', async () => {
    const salt = generateSaltBase64();
    const key = await deriveKey('1234', salt);
    const ciphertext = await encrypt('hello world', key);
    const plaintext = await decrypt(ciphertext, key);
    expect(plaintext).toBe('hello world');
  });

  it('verification block validates correct PIN and rejects wrong PIN', async () => {
    const salt = generateSaltBase64();
    const key = await deriveKey('1234', salt);
    const block = await createVerificationBlock(key);

    expect(await verifyPin('1234', salt, block)).toBe(true);
    expect(await verifyPin('9999', salt, block)).toBe(false);
  });
});

