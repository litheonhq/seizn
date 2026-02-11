/**
 * Safe JSON parser with automatic encoding detection.
 *
 * Problem: Windows clients send JSON bodies using the system's default
 * codepage instead of UTF-8. Common culprits:
 *   - CP949 (Korean Windows)
 *   - GBK/CP936 (Chinese Simplified Windows)
 *   - Shift-JIS/CP932 (Japanese Windows)
 *   - Big5/CP950 (Chinese Traditional Windows)
 *   - Windows-1256 (Arabic Windows)
 *   - Windows-1251 (Cyrillic Windows)
 *   - Windows-1252 (Western European Windows)
 *
 * Solution: Read raw bytes, validate UTF-8 first, then try common
 * legacy encodings until one produces valid JSON.
 *
 * WHATWG encoding labels used by TextDecoder:
 *   'euc-kr' → CP949 superset
 *   'gbk'    → GBK/CP936
 *   'shift_jis' → Windows-31J/CP932
 *   'big5'   → Big5/CP950
 *   'windows-1256' → Arabic
 *   'windows-1251' → Cyrillic
 *   'windows-1252' → Western European (Latin-1 superset)
 */

/**
 * Candidate encodings to try when UTF-8 validation fails.
 * Ordered by global Windows install base (CJK first, then single-byte).
 */
const FALLBACK_ENCODINGS = [
  'euc-kr',        // Korean (CP949)
  'gbk',           // Chinese Simplified (CP936)
  'shift_jis',     // Japanese (CP932)
  'big5',          // Chinese Traditional (CP950)
  'windows-1256',  // Arabic
  'windows-1251',  // Cyrillic (Russian, Ukrainian, etc.)
  'windows-1252',  // Western European
] as const;

/**
 * Fast byte-level UTF-8 validation.
 * Returns false if any byte sequence violates UTF-8 encoding rules.
 */
function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b <= 0x7f) {
      i++;
    } else if (b >= 0xc2 && b <= 0xdf) {
      if (i + 1 >= bytes.length || (bytes[i + 1] & 0xc0) !== 0x80) return false;
      i += 2;
    } else if (b >= 0xe0 && b <= 0xef) {
      if (
        i + 2 >= bytes.length ||
        (bytes[i + 1] & 0xc0) !== 0x80 ||
        (bytes[i + 2] & 0xc0) !== 0x80
      )
        return false;
      if (b === 0xe0 && bytes[i + 1] < 0xa0) return false;
      i += 3;
    } else if (b >= 0xf0 && b <= 0xf4) {
      if (
        i + 3 >= bytes.length ||
        (bytes[i + 1] & 0xc0) !== 0x80 ||
        (bytes[i + 2] & 0xc0) !== 0x80 ||
        (bytes[i + 3] & 0xc0) !== 0x80
      )
        return false;
      if (b === 0xf0 && bytes[i + 1] < 0x90) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * Parse JSON from a Request with automatic encoding detection.
 *
 * Flow:
 * 1. Read raw bytes from request body
 * 2. Pure ASCII → parse directly (no encoding ambiguity)
 * 3. Valid UTF-8 → parse as UTF-8
 * 4. Not valid UTF-8 → try fallback encodings (decode + JSON.parse)
 * 5. Last resort → UTF-8 with replacement characters
 */
export async function safeJsonParse<T = unknown>(request: Request): Promise<T> {
  const buffer = await request.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Fast path: check for non-ASCII bytes
  let hasHighBytes = false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] > 0x7f) {
      hasHighBytes = true;
      break;
    }
  }

  // Pure ASCII → no encoding ambiguity (also covers ensure_ascii=True JSON)
  if (!hasHighBytes) {
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  // Has non-ASCII bytes: validate UTF-8
  if (isValidUtf8(bytes)) {
    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  }

  // Not valid UTF-8 → try fallback encodings
  console.warn('[safe-json] Non-UTF-8 bytes detected, trying legacy encoding fallbacks');

  for (const encoding of FALLBACK_ENCODINGS) {
    try {
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      const parsed = JSON.parse(decoded) as T;
      console.info(`[safe-json] Successfully decoded as ${encoding}`);
      return parsed;
    } catch {
      // This encoding didn't work, try next
    }
  }

  // All fallbacks failed → last resort: UTF-8 with replacement characters
  console.warn('[safe-json] All encoding fallbacks failed, using UTF-8 with replacement chars');
  return JSON.parse(new TextDecoder('utf-8', { fatal: false }).decode(bytes));
}
