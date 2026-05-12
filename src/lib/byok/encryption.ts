import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment or derive from secret.
 *
 * R28 C1/H1 hardening — pre-fix this function fell back to NEXTAUTH_SECRET
 * for both `secret` and `salt` when the dedicated BYOK env vars were
 * unset. In any deploy where neither was set explicitly, scrypt collapsed
 * to scryptSync(NEXTAUTH_SECRET, NEXTAUTH_SECRET) — the salt's entropy
 * was nullified. A leak of the encrypted key column + NEXTAUTH_SECRET
 * (which the auth stack already exposes through other surfaces) was
 * effectively decryptable. The fallback also tied BYOK key durability
 * to NEXTAUTH_SECRET rotation, which is a separate cadence.
 *
 * Behavior now:
 *   - Production: HARD FAIL if BYOK_ENCRYPTION_SECRET is unset, OR if
 *     BYOK_ENCRYPTION_SALT is unset, OR if the resolved secret equals
 *     the resolved salt (defense-in-depth against operators copy-pasting
 *     the same value into both vars).
 *   - Non-production: fallback to NEXTAUTH_SECRET still allowed for dev
 *     ergonomics, but logs a warning the first time the fallback fires.
 *
 * Operator action items (documented in ISSUES.md):
 *   1. Set BYOK_ENCRYPTION_SECRET (32+ random bytes, base64) in prod env.
 *   2. Set BYOK_ENCRYPTION_SALT (different 32+ bytes, base64) in prod env.
 *   3. Re-encryption migration for existing rows is deferred — see
 *      ISSUES.md "BYOK re-encryption" entry.
 */
let warnedDevFallback = false;

function getEncryptionKey(): Buffer {
  const isProd = process.env.NODE_ENV === 'production';

  const explicitSecret = process.env.BYOK_ENCRYPTION_SECRET;
  const explicitSalt = process.env.BYOK_ENCRYPTION_SALT;
  const fallbackSecret = process.env.NEXTAUTH_SECRET;

  if (isProd) {
    if (!explicitSecret) {
      throw new Error(
        "BYOK_ENCRYPTION_SECRET must be set in production (no NEXTAUTH_SECRET fallback allowed)",
      );
    }
    if (!explicitSalt) {
      throw new Error(
        "BYOK_ENCRYPTION_SALT must be set in production (no NEXTAUTH_SECRET fallback allowed)",
      );
    }
    if (explicitSecret === explicitSalt) {
      throw new Error(
        "BYOK_ENCRYPTION_SECRET and BYOK_ENCRYPTION_SALT must be different values",
      );
    }
    return scryptSync(explicitSecret, explicitSalt, KEY_LENGTH);
  }

  // Non-production: allow fallback but warn loudly the first time.
  const secret = explicitSecret || fallbackSecret;
  if (!secret) {
    throw new Error("BYOK_ENCRYPTION_SECRET or NEXTAUTH_SECRET must be set");
  }
  const salt = explicitSalt || fallbackSecret;
  if (!salt) {
    throw new Error("BYOK_ENCRYPTION_SALT or NEXTAUTH_SECRET must be set");
  }
  if ((!explicitSecret || !explicitSalt) && !warnedDevFallback) {
    warnedDevFallback = true;
    console.warn(
      "[byok/encryption] Using NEXTAUTH_SECRET fallback for BYOK KDF. " +
        "Set BYOK_ENCRYPTION_SECRET and BYOK_ENCRYPTION_SALT in production.",
    );
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
    // R28 M1 — Cohere keys are 40-char base32-ish (e.g. "abc123XYZ..."),
    // not arbitrary 32+ alphanumeric. Tighten so spoofed junk doesn't pass.
    cohere: /^[A-Za-z0-9]{40}$/,
    voyage: /^[a-zA-Z0-9-]{32,}$/,
    // R24 H3 — real Google AI Studio keys are exactly `AIza` + 35 chars
    // (`[0-9A-Za-z_-]`). The pre-fix permissive regex accepted any 32+ char
    // alphanumeric string; typos / wrong keys passed validation, got stored,
    // then failed with a 401 on the first generate call. Tighter shape
    // catches the common copy-paste mistakes upfront.
    google: /^AIza[0-9A-Za-z_-]{35}$/,
    // R28 M1 — Azure OpenAI keys are 32-hex (lowercase a-f only).
    azure: /^[a-f0-9]{32}$/,
  };

  const pattern = patterns[provider];
  if (!pattern) {
    // Unknown provider, accept any non-empty key
    return apiKey.length >= 16;
  }

  return pattern.test(apiKey);
}
