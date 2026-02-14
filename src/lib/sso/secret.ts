import crypto from 'crypto';

const PREFIX = 'enc_v1:';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce recommended for GCM
const TAG_LENGTH = 16;

function getEncryptionSecret(): string | undefined {
  return (
    process.env.SSO_ENCRYPTION_KEY ||
    process.env.SEIZN_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET
  );
}

function deriveKey(secret: string): Buffer {
  // Derive a stable 32-byte key from any input string.
  return crypto.createHash('sha256').update(secret, 'utf-8').digest();
}

export function isEncryptedSSOSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}

/**
 * Encrypt a secret for DB storage.
 *
 * Format:
 *   enc_v1:<base64([12B iv][16B tag][ciphertext])>
 */
export function encryptSSOSecret(plaintext: string): string {
  if (!plaintext) {
    throw new Error('Cannot encrypt an empty secret');
  }

  // Avoid double-encryption if a caller passes a stored value back.
  if (isEncryptedSSOSecret(plaintext)) {
    return plaintext;
  }

  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error('SSO encryption secret not configured');
  }

  const key = deriveKey(secret);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf-8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64');
  return `${PREFIX}${payload}`;
}

/**
 * Decrypt a secret read from DB storage.
 *
 * Back-compat:
 * - If the value is not prefixed with enc_v1:, it's treated as plaintext.
 */
export function decryptSSOSecret(value: string): string {
  if (!value) {
    throw new Error('Missing secret value');
  }

  if (!isEncryptedSSOSecret(value)) {
    return value;
  }

  const secret = getEncryptionSecret();
  if (!secret) {
    throw new Error('SSO encryption secret not configured');
  }

  const key = deriveKey(secret);
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');

  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid encrypted secret payload');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf-8');
}

