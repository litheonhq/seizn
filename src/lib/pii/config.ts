/**
 * PII Scanner Policy Configuration
 *
 * Configurable rules for how PII should be handled in the Write Pipeline.
 * Supports per-namespace overrides and different actions per PII type.
 */

import type { PIIType } from './scanner';

// =============================================================================
// Types
// =============================================================================

export type PIIAction = 'block' | 'mask' | 'warn' | 'allow';

export interface PIITypePolicy {
  /** Action to take when this PII type is detected */
  action: PIIAction;
  /** Minimum confidence threshold to trigger action (0-1) */
  confidenceThreshold?: number;
  /** Custom error message when blocked */
  blockMessage?: string;
}

export interface NamespacePolicy {
  /** Override default policies for this namespace */
  overrides?: Partial<Record<PIIType, PIITypePolicy>>;
  /** Completely disable PII scanning for this namespace */
  disabled?: boolean;
  /** Allow all PII types (override all policies to 'allow') */
  allowAll?: boolean;
}

export interface PIIPolicyConfig {
  /** Whether PII scanning is enabled globally */
  enabled: boolean;

  /** Default policies for each PII type */
  defaultPolicies: Record<PIIType, PIITypePolicy>;

  /** Per-namespace policy overrides */
  namespaceOverrides: Record<string, NamespacePolicy>;

  /** Global confidence threshold (can be overridden per type) */
  globalConfidenceThreshold: number;

  /** Whether to include masked content in error responses */
  includeMaskedInError: boolean;

  /** Whether to log PII detections (without the actual values) */
  logDetections: boolean;
}

// =============================================================================
// Default Configuration
// =============================================================================

/**
 * Default PII policy configuration
 * - Blocks high-risk items (API keys, private keys)
 * - Masks medium-risk items (email, phone, SSN, credit cards)
 * - Warns on lower-risk items (IP addresses)
 */
export const DEFAULT_PII_POLICY: PIIPolicyConfig = {
  enabled: true,

  globalConfidenceThreshold: 0.7,

  includeMaskedInError: true,

  logDetections: true,

  defaultPolicies: {
    // Block - these should never be stored
    api_key: {
      action: 'block',
      confidenceThreshold: 0.85,
      blockMessage: 'API keys should not be stored in memories. Store the key location instead.',
    },
    aws_key: {
      action: 'block',
      confidenceThreshold: 0.85,
      blockMessage: 'AWS credentials should not be stored in memories.',
    },
    github_token: {
      action: 'block',
      confidenceThreshold: 0.9,
      blockMessage: 'GitHub tokens should not be stored in memories.',
    },
    private_key: {
      action: 'block',
      confidenceThreshold: 0.95,
      blockMessage: 'Private keys should never be stored in memories.',
    },
    jwt: {
      action: 'block',
      confidenceThreshold: 0.9,
      blockMessage: 'JWT tokens should not be stored in memories.',
    },
    password: {
      action: 'block',
      confidenceThreshold: 0.8,
      blockMessage: 'Passwords should not be stored in memories.',
    },

    // Mask - replace with placeholder but allow storage
    ssn: {
      action: 'mask',
      confidenceThreshold: 0.85,
      blockMessage: 'Social Security Numbers will be masked.',
    },
    credit_card: {
      action: 'mask',
      confidenceThreshold: 0.9,
      blockMessage: 'Credit card numbers will be masked.',
    },
    email: {
      action: 'mask',
      confidenceThreshold: 0.9,
    },
    phone: {
      action: 'mask',
      confidenceThreshold: 0.85,
    },

    // Warn - log but allow storage
    ip_address: {
      action: 'warn',
      confidenceThreshold: 0.85,
    },
    base64_secret: {
      action: 'warn',
      confidenceThreshold: 0.7,
    },

    // Allow - no action needed
    name: {
      action: 'allow',
      confidenceThreshold: 0.8,
    },
    address: {
      action: 'allow',
      confidenceThreshold: 0.8,
    },
  },

  namespaceOverrides: {
    // Example: More permissive for internal/debug namespace
    'internal-debug': {
      disabled: true, // Completely disable scanning
    },

    // Example: Strict mode for sensitive namespace
    'pii-sensitive': {
      overrides: {
        email: { action: 'block', confidenceThreshold: 0.9 },
        phone: { action: 'block', confidenceThreshold: 0.9 },
        ip_address: { action: 'mask', confidenceThreshold: 0.85 },
      },
    },

    // Example: Allow all for test namespace
    'test': {
      allowAll: true,
    },
  },
};

// =============================================================================
// Policy Resolution
// =============================================================================

/**
 * Get the effective policy for a PII type in a specific namespace
 */
export function getEffectivePolicy(
  piiType: PIIType,
  namespace: string = 'default',
  config: PIIPolicyConfig = DEFAULT_PII_POLICY
): PIITypePolicy {
  // Check if scanning is disabled globally
  if (!config.enabled) {
    return { action: 'allow' };
  }

  // Check namespace-specific settings
  const namespacePolicy = config.namespaceOverrides[namespace];
  if (namespacePolicy) {
    // Check if scanning is disabled for this namespace
    if (namespacePolicy.disabled) {
      return { action: 'allow' };
    }

    // Check if all PII is allowed for this namespace
    if (namespacePolicy.allowAll) {
      return { action: 'allow' };
    }

    // Check for type-specific override in this namespace
    if (namespacePolicy.overrides?.[piiType]) {
      return {
        ...config.defaultPolicies[piiType],
        ...namespacePolicy.overrides[piiType],
      };
    }
  }

  // Return default policy for this type
  return config.defaultPolicies[piiType];
}

/**
 * Get all PII types that should be blocked for a namespace
 */
export function getBlockedTypes(
  namespace: string = 'default',
  config: PIIPolicyConfig = DEFAULT_PII_POLICY
): PIIType[] {
  const allTypes = Object.keys(config.defaultPolicies) as PIIType[];

  return allTypes.filter(type => {
    const policy = getEffectivePolicy(type, namespace, config);
    return policy.action === 'block';
  });
}

/**
 * Get all PII types that should be masked for a namespace
 */
export function getMaskedTypes(
  namespace: string = 'default',
  config: PIIPolicyConfig = DEFAULT_PII_POLICY
): PIIType[] {
  const allTypes = Object.keys(config.defaultPolicies) as PIIType[];

  return allTypes.filter(type => {
    const policy = getEffectivePolicy(type, namespace, config);
    return policy.action === 'mask';
  });
}

/**
 * Check if PII scanning should be performed for a namespace
 */
export function shouldScanNamespace(
  namespace: string = 'default',
  config: PIIPolicyConfig = DEFAULT_PII_POLICY
): boolean {
  if (!config.enabled) return false;

  const namespacePolicy = config.namespaceOverrides[namespace];
  if (namespacePolicy?.disabled) return false;
  if (namespacePolicy?.allowAll) return false;

  return true;
}

// =============================================================================
// Runtime Configuration
// =============================================================================

let runtimeConfig: PIIPolicyConfig = { ...DEFAULT_PII_POLICY };

/**
 * Get the current runtime PII policy configuration
 */
export function getPIIConfig(): PIIPolicyConfig {
  return runtimeConfig;
}

/**
 * Update the runtime PII policy configuration
 * Use this to dynamically change policies without restarting
 */
export function updatePIIConfig(updates: Partial<PIIPolicyConfig>): void {
  runtimeConfig = {
    ...runtimeConfig,
    ...updates,
    // Deep merge for nested objects
    defaultPolicies: {
      ...runtimeConfig.defaultPolicies,
      ...updates.defaultPolicies,
    },
    namespaceOverrides: {
      ...runtimeConfig.namespaceOverrides,
      ...updates.namespaceOverrides,
    },
  };
}

/**
 * Reset runtime configuration to defaults
 */
export function resetPIIConfig(): void {
  runtimeConfig = { ...DEFAULT_PII_POLICY };
}

/**
 * Add or update a namespace policy at runtime
 */
export function setNamespacePolicy(
  namespace: string,
  policy: NamespacePolicy
): void {
  runtimeConfig.namespaceOverrides[namespace] = policy;
}

/**
 * Remove a namespace policy override (revert to defaults)
 */
export function removeNamespacePolicy(namespace: string): void {
  delete runtimeConfig.namespaceOverrides[namespace];
}
