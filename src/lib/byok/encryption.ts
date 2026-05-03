import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment or derive from secret
 */
function getEncryptionKey(): Buffer {
  const secret = process.env.BYOK_ENCRYPTION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("BYOK_ENCRYPTION_SECRET or NEXTAUTH_SECRET must be set");
  }

  const salt = process.env.BYOK_ENCRYPTION_SALT || process.env.NEXTAUTH_SECRET;
  if (!salt) {
    throw new Error("BYOK_ENCRYPTION_SALT or NEXTAUTH_SECRET must be set");
  }

  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * Encrypt an API key for storage
 * @param plaintext The API key to encrypt
 * @returns Base64 encoded encrypted string (iv:authTag:ciphertext)
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
}

/**
 * Decrypt an API key from storage
 * @param encrypted The encrypted string from storage
 * @returns The original API key
 */
export function decryptApiKey(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format");
  }

  const iv = Buffer.from(parts[0], "base64");
  const authTag = Buffer.from(parts[1], "base64");
  const ciphertext = parts[2];

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a key hint for display (last 4 characters)
 * @param apiKey The full API key
 * @returns A hint like "...abc1"
 */
export function generateKeyHint(apiKey: string): string {
  if (apiKey.length < 4) return "****";
  return `...${apiKey.slice(-4)}`;
}

/**
 * Mask an API key for logging (show only prefix and hint)
 * @param apiKey The full API key
 * @returns A masked version like "sk-...abc1"
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length < 8) return "****";
  const prefix = apiKey.slice(0, 4);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Validate API key format for known providers
 */
export function validateKeyFormat(provider: string, apiKey: string): boolean {
  const patterns: Record<string, RegExp> = {
    openai: /^sk-[a-zA-Z0-9_-]{32,}$/,
    anthropic: /^sk-ant-[a-zA-Z0-9_-]{32,}$/,
    cohere: /^[a-zA-Z0-9]{32,}$/,
    voyage: /^[a-zA-Z0-9-]{32,}$/,
    google: /^[a-zA-Z0-9_-]{32,}$/,
    azure: /^[a-zA-Z0-9]{32}$/,
  };

  const pattern = patterns[provider];
  if (!pattern) {
    // Unknown provider, accept any non-empty key
    return apiKey.length >= 16;
  }

  return pattern.test(apiKey);
}
