import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'szn_';

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Generate 32 random bytes (256 bits)
  const randomPart = randomBytes(32).toString('base64url');
  const key = `${API_KEY_PREFIX}${randomPart}`;

  // Hash the key for storage
  const hash = hashApiKey(key);

  // Prefix for identification (first 8 chars after szn_)
  const prefix = key.substring(0, 12); // szn_ + 8 chars

  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function validateApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length >= 40;
}
