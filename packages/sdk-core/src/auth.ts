/**
 * Seizn Core SDK - Authentication Module
 *
 * API key management and validation.
 */

import { AuthenticationError } from './errors';

/**
 * API key prefix for Seizn keys
 */
const API_KEY_PREFIX = 'szn_';

/**
 * Environment variable name for API key
 */
const API_KEY_ENV_VAR = 'SEIZN_API_KEY';

/**
 * API key validation result
 */
export interface ApiKeyValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Validate API key format
 */
export function validateApiKey(apiKey: string | undefined | null): ApiKeyValidation {
  if (!apiKey) {
    return { valid: false, reason: 'API key is required' };
  }

  if (typeof apiKey !== 'string') {
    return { valid: false, reason: 'API key must be a string' };
  }

  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    return { valid: false, reason: 'API key cannot be empty' };
  }

  // Check for valid prefix
  if (!trimmed.startsWith(API_KEY_PREFIX)) {
    return {
      valid: false,
      reason: `API key must start with '${API_KEY_PREFIX}'`,
    };
  }

  // Check minimum length (prefix + at least 20 chars)
  if (trimmed.length < API_KEY_PREFIX.length + 20) {
    return { valid: false, reason: 'API key is too short' };
  }

  // Check for valid characters (alphanumeric + underscore)
  const keyPart = trimmed.slice(API_KEY_PREFIX.length);
  if (!/^[a-zA-Z0-9_]+$/.test(keyPart)) {
    return { valid: false, reason: 'API key contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Resolve API key from config or environment
 */
export function resolveApiKey(configApiKey?: string): string {
  // Try config first
  if (configApiKey) {
    const validation = validateApiKey(configApiKey);
    if (validation.valid) {
      return configApiKey.trim();
    }
    throw new AuthenticationError(validation.reason);
  }

  // Fall back to environment variable
  const envApiKey = getEnvApiKey();
  if (envApiKey) {
    const validation = validateApiKey(envApiKey);
    if (validation.valid) {
      return envApiKey.trim();
    }
    throw new AuthenticationError(
      `Invalid API key in ${API_KEY_ENV_VAR}: ${validation.reason}`
    );
  }

  throw new AuthenticationError(
    `API key required. Pass apiKey in config or set ${API_KEY_ENV_VAR} environment variable.`
  );
}

/**
 * Get API key from environment variable
 */
function getEnvApiKey(): string | undefined {
  // Node.js environment
  if (typeof process !== 'undefined' && process.env) {
    return process.env[API_KEY_ENV_VAR];
  }

  // Browser environment (if exposed via build tools)
  if (typeof window !== 'undefined') {
    // @ts-expect-error - env might be exposed via bundler
    return window.__ENV__?.[API_KEY_ENV_VAR];
  }

  return undefined;
}

/**
 * Mask API key for logging (show prefix and last 4 chars)
 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey || apiKey.length < 8) {
    return '***';
  }

  const prefix = apiKey.slice(0, API_KEY_PREFIX.length);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Build authorization header (canonical)
 */
export function buildAuthHeader(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Alternative: Build Bearer auth header
 */
export function buildBearerHeader(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Check if API key appears to be a test key
 */
export function isTestKey(apiKey: string): boolean {
  return apiKey.includes('_test_') || apiKey.startsWith('szn_test_');
}

/**
 * Check if API key appears to be a live key
 */
export function isLiveKey(apiKey: string): boolean {
  return apiKey.includes('_live_') || apiKey.startsWith('szn_live_');
}
