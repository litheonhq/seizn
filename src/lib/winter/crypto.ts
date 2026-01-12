import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM
const TAG_LENGTH = 16;

function deriveKey(secret: string | undefined): Buffer {
  if (!secret) {
    throw new Error('SEIZN_ENCRYPTION_KEY not set');
  }
  // We accept any string and derive a fixed 32-byte key.
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

/**
 * Encrypt JSON with AES-256-GCM.
 *
 * Output format (base64):
 *   [12B iv][16B tag][ciphertext]
 */
export function encryptJson(value: unknown, secret?: string): string {
  const key = deriveKey(secret ?? process.env.SEIZN_ENCRYPTION_KEY);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/**
 * Decrypt JSON previously encrypted by encryptJson().
 */
export function decryptJson<T = unknown>(payloadB64: string, secret?: string): T {
  const key = deriveKey(secret ?? process.env.SEIZN_ENCRYPTION_KEY);
  const buf = Buffer.from(payloadB64, 'base64');

  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted payload');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf-8')) as T;
}
