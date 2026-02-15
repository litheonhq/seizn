/**
 * E2E Memory Encryption (client-side)
 *
 * - Key derivation: PBKDF2-SHA256(pin, salt, iterations) -> AES-GCM 256-bit key
 * - Encryption: AES-256-GCM with random 12-byte IV
 * - Encoding: base64( IV || ciphertext||tag )
 *
 * Security notes:
 * - PIN is never stored.
 * - Derived CryptoKey must never be persisted (localStorage/sessionStorage/DB).
 * - Salt + verification block are not secrets and can be stored server-side.
 */

const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 32;
const GCM_IV_BYTES = 12;
export const E2E_VERIFY_PLAINTEXT = 'SEIZN_E2E_VERIFY';

function bytesToBase64(bytes: Uint8Array): string {
  // Node (tests) fast-path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal = globalThis as any;
  if (typeof anyGlobal.Buffer !== 'undefined') {
    return anyGlobal.Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  // Node (tests) fast-path
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyGlobal = globalThis as any;
  if (typeof anyGlobal.Buffer !== 'undefined') {
    return new Uint8Array(anyGlobal.Buffer.from(base64, 'base64'));
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateSaltBase64(): string {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export async function deriveKey(pin: string, saltBase64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  // Copy into a fresh Uint8Array backed by an ArrayBuffer (avoids ArrayBufferLike typing issues).
  const salt = new Uint8Array(base64ToBytes(saltBase64));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(plaintext: string, key: CryptoKey): Promise<string> {
  const iv = new Uint8Array(GCM_IV_BYTES);
  crypto.getRandomValues(iv);

  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );

  const cipherBytes = new Uint8Array(ciphertext);
  const combined = new Uint8Array(iv.length + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, iv.length);
  return bytesToBase64(combined);
}

export async function decrypt(encryptedBase64: string, key: CryptoKey): Promise<string> {
  // Copy into a fresh Uint8Array backed by an ArrayBuffer (avoids ArrayBufferLike typing issues).
  const combined = new Uint8Array(base64ToBytes(encryptedBase64));
  if (combined.length <= GCM_IV_BYTES) {
    throw new Error('Invalid ciphertext');
  }

  const iv = combined.subarray(0, GCM_IV_BYTES);
  const cipherBytes = combined.subarray(GCM_IV_BYTES);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    cipherBytes
  );

  const dec = new TextDecoder();
  return dec.decode(plaintext);
}

export async function createVerificationBlock(key: CryptoKey): Promise<string> {
  return encrypt(E2E_VERIFY_PLAINTEXT, key);
}

export async function verifyPin(
  pin: string,
  saltBase64: string,
  verificationBlockBase64: string
): Promise<boolean> {
  try {
    const key = await deriveKey(pin, saltBase64);
    const plaintext = await decrypt(verificationBlockBase64, key);
    return plaintext === E2E_VERIFY_PLAINTEXT;
  } catch {
    return false;
  }
}
