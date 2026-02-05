/**
 * Feature Flags Types
 *
 * Type definitions for feature flags and experiments.
 *
 * @module lib/feature-flags/types
 */

// =============================================================================
// Feature Flag Types
// =============================================================================

export interface FeatureFlagValue {
  /** Flag is enabled */
  enabled: boolean;
  /** Variant key (for multivariate flags) */
  variant?: string;
  /** Payload data */
  payload?: Record<string, unknown>;
}

export interface FeatureFlag {
  /** Flag key */
  key: string;
  /** Current value */
  value: FeatureFlagValue;
  /** Flag source */
  source: 'posthog' | 'local' | 'override';
  /** When the flag was evaluated */
  evaluatedAt: number;
}

// =============================================================================
// Experiment Types
// =============================================================================

export interface Experiment {
  /** Experiment key */
  key: string;
  /** Variant the user is assigned to */
  variant: string;
  /** Available variants */
  variants: string[];
  /** Whether user is part of the experiment */
  isParticipant: boolean;
}

export interface ExperimentPayload {
  /** Experiment key */
  key: string;
  /** Variant key */
  variant: string;
  /** Payload data for this variant */
  payload?: Record<string, unknown>;
}

// =============================================================================
// Config Types
// =============================================================================

export interface FeatureFlagsConfig {
  /** PostHog API key */
  apiKey?: string;
  /** PostHog host URL */
  host?: string;
  /** Enable debug mode */
  debug?: boolean;
  /** Bootstrap flags for SSR */
  bootstrap?: Record<string, boolean | string>;
  /** Custom properties for flag evaluation */
  customProperties?: Record<string, unknown>;
  /** Disable automatic capture */
  disableAutocapture?: boolean;
  /** Local overrides for testing */
  overrides?: Record<string, boolean | string>;
}

export interface FeatureFlagContext {
  /** User ID */
  userId?: string;
  /** Anonymous ID */
  anonymousId?: string;
  /** User properties */
  properties?: Record<string, unknown>;
  /** Groups */
  groups?: Record<string, string>;
}

// =============================================================================
// Event Types
// =============================================================================

export interface FeatureFlagEvent {
  type: 'flag_evaluated' | 'experiment_started' | 'experiment_converted';
  key: string;
  value: unknown;
  timestamp: number;
  context?: FeatureFlagContext;
}

// =============================================================================
// Known Flags
// =============================================================================

/**
 * Define your feature flags here for type safety
 */
export interface KnownFlags {
  // UI Features
  'new-dashboard-layout': boolean;
  'dark-mode-v2': boolean;
  'mindmap-webgl': boolean;

  // Memory Features
  'memory-v4-search': boolean;
  'graph-expansion': boolean;
  'community-detection': boolean;

  // Experiments
  'onboarding-flow': 'control' | 'variant-a' | 'variant-b';
  'search-algorithm': 'default' | 'hybrid' | 'graph-first';

  // Beta Features
  'beta-connectors': boolean;
  'beta-voice-input': boolean;
  'beta-collaboration': boolean;
}

export type FlagKey = keyof KnownFlags;
export type FlagValue<K extends FlagKey> = KnownFlags[K];
