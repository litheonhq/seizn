import { createHash, randomBytes } from 'crypto';

export const TRACK_2_API_KEY_PREFIX = 'sk_seizn_';
const DISPLAY_ID_BYTES = 4;
const SECRET_BYTES = 32;

export type GeneratedApiKey = {
  key: string;
  hash: string;
  prefix: string;
};

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): GeneratedApiKey {
  const displayId = randomBytes(DISPLAY_ID_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const prefix = `${TRACK_2_API_KEY_PREFIX}${displayId}`;
  const key = `${prefix}_${secret}`;

  return {
    key,
    hash: hashApiKey(key),
    prefix,
  };
}

export function extractPrefix(key: string): string | null {
  const match = key.match(/^sk_seizn_[A-Za-z0-9]{8}_/);
  if (!match) {
    return null;
  }

  return match[0].slice(0, -1);
}

export function formatDisplay(key: string): string {
  const prefix = extractPrefix(key);
  if (!prefix) {
    return 'sk_seizn_invalid';
  }

  const suffix = key.slice(-3);
  return `${prefix}...${suffix}`;
}
