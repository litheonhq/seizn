'use client';

/**
 * PostHog Client
 *
 * PostHog integration for feature flags and analytics.
 *
 * @module lib/feature-flags/posthog-client
 */

import type {
  FeatureFlagsConfig,
  FeatureFlagContext,
  FeatureFlagValue,
  KnownFlags,
  FlagKey,
  FlagValue,
} from './types';

// =============================================================================
// PostHog Client
// =============================================================================

type PostHogInstance = {
  init: (apiKey: string, config: Record<string, unknown>) => void;
  identify: (userId: string, properties?: Record<string, unknown>) => void;
  reset: () => void;
  capture: (event: string, properties?: Record<string, unknown>) => void;
  isFeatureEnabled: (key: string, options?: Record<string, unknown>) => boolean;
  getFeatureFlag: (key: string, options?: Record<string, unknown>) => boolean | string | undefined;
  getFeatureFlagPayload: (key: string) => Record<string, unknown> | undefined;
  onFeatureFlags: (callback: (flags: string[]) => void) => void;
  reloadFeatureFlags: () => void;
  setPersonProperties: (properties: Record<string, unknown>) => void;
  group: (type: string, key: string, properties?: Record<string, unknown>) => void;
};

class PostHogClient {
  private config: FeatureFlagsConfig;
  private posthog: PostHogInstance | null = null;
  private isInitialized = false;
  private flagCache = new Map<string, { value: unknown; timestamp: number }>();
  private overrides = new Map<string, boolean | string>();
  private onFlagsLoadedCallbacks: Array<(flags: string[]) => void> = [];

  constructor(config: FeatureFlagsConfig = {}) {
    this.config = {
      apiKey: config.apiKey || process.env.NEXT_PUBLIC_POSTHOG_KEY,
      host: config.host || process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
      debug: config.debug || process.env.NODE_ENV === 'development',
      bootstrap: config.bootstrap || {},
      customProperties: config.customProperties || {},
      disableAutocapture: config.disableAutocapture ?? true,
      overrides: config.overrides || {},
    };

    // Set up local overrides
    if (this.config.overrides) {
      Object.entries(this.config.overrides).forEach(([key, value]) => {
        this.overrides.set(key, value);
      });
    }
  }

  /**
   * Initialize PostHog
   */
  async init(): Promise<void> {
    if (this.isInitialized || typeof window === 'undefined') return;

    if (!this.config.apiKey) {
      console.warn('[FeatureFlags] No PostHog API key provided');
      return;
    }

    try {
      // Dynamic import to avoid SSR issues
      const posthogLib = await import('posthog-js');
      this.posthog = posthogLib.default as unknown as PostHogInstance;

      this.posthog.init(this.config.apiKey, {
        api_host: this.config.host,
        loaded: (ph: PostHogInstance) => {
          if (this.config.debug) {
            console.log('[FeatureFlags] PostHog loaded');
          }
        },
        autocapture: !this.config.disableAutocapture,
        capture_pageview: false, // We handle this manually
        capture_pageleave: true,
        bootstrap: {
          featureFlags: this.config.bootstrap,
        },
        disable_session_recording: true, // Can be enabled separately
        persistence: 'localStorage',
        person_profiles: 'identified_only',
      });

      // Set up flags loaded callback
      this.posthog.onFeatureFlags((flags) => {
        this.onFlagsLoadedCallbacks.forEach((cb) => cb(flags));
      });

      this.isInitialized = true;

      if (this.config.debug) {
        console.log('[FeatureFlags] Initialized');
      }
    } catch (error) {
      console.error('[FeatureFlags] Failed to initialize:', error);
    }
  }

  /**
   * Identify user
   */
  identify(context: FeatureFlagContext): void {
    if (!this.posthog) return;

    if (context.userId) {
      this.posthog.identify(context.userId, context.properties);
    }

    if (context.groups) {
      Object.entries(context.groups).forEach(([type, key]) => {
        this.posthog!.group(type, key);
      });
    }
  }

  /**
   * Reset user (on logout)
   */
  reset(): void {
    this.posthog?.reset();
    this.flagCache.clear();
  }

  /**
   * Get feature flag value with type safety
   */
  getFlag<K extends FlagKey>(key: K, defaultValue?: FlagValue<K>): FlagValue<K> | undefined {
    // Check overrides first
    if (this.overrides.has(key)) {
      return this.overrides.get(key) as FlagValue<K>;
    }

    // Check cache
    const cached = this.flagCache.get(key);
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.value as FlagValue<K>;
    }

    if (!this.posthog) {
      return defaultValue;
    }

    const value = this.posthog.getFeatureFlag(key);

    // Cache the result
    this.flagCache.set(key, { value, timestamp: Date.now() });

    return (value ?? defaultValue) as FlagValue<K>;
  }

  /**
   * Check if feature is enabled
   */
  isEnabled<K extends FlagKey>(key: K): boolean {
    const value = this.getFlag(key);
    return value === true || (typeof value === 'string' && value !== 'control');
  }

  /**
   * Get feature flag with full metadata
   */
  getFlagWithPayload<K extends FlagKey>(key: K): FeatureFlagValue {
    const value = this.getFlag(key);
    const payload = this.posthog?.getFeatureFlagPayload(key);

    return {
      enabled: this.isEnabled(key),
      variant: typeof value === 'string' ? value : undefined,
      payload,
    };
  }

  /**
   * Get all feature flags
   */
  getAllFlags(): Partial<KnownFlags> {
    const flags: Partial<KnownFlags> = {};

    // We can't easily enumerate all flags without PostHog's internal state
    // This is a limitation - flags must be known ahead of time
    return flags;
  }

  /**
   * Set local override for testing
   */
  setOverride<K extends FlagKey>(key: K, value: FlagValue<K>): void {
    this.overrides.set(key, value as boolean | string);
    this.flagCache.delete(key);

    if (this.config.debug) {
      console.log(`[FeatureFlags] Override set: ${key} = ${value}`);
    }
  }

  /**
   * Clear override
   */
  clearOverride(key: FlagKey): void {
    this.overrides.delete(key);
    this.flagCache.delete(key);
  }

  /**
   * Clear all overrides
   */
  clearAllOverrides(): void {
    this.overrides.clear();
    this.flagCache.clear();
  }

  /**
   * Reload flags from server
   */
  reloadFlags(): void {
    this.flagCache.clear();
    this.posthog?.reloadFeatureFlags();
  }

  /**
   * Register callback for when flags are loaded
   */
  onFlagsLoaded(callback: (flags: string[]) => void): () => void {
    this.onFlagsLoadedCallbacks.push(callback);
    return () => {
      const index = this.onFlagsLoadedCallbacks.indexOf(callback);
      if (index > -1) {
        this.onFlagsLoadedCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Track event
   */
  track(event: string, properties?: Record<string, unknown>): void {
    this.posthog?.capture(event, properties);
  }

  /**
   * Track experiment exposure
   */
  trackExperimentExposure(experimentKey: string, variant: string): void {
    this.track('$experiment_started', {
      experiment: experimentKey,
      variant,
    });
  }

  /**
   * Track experiment conversion
   */
  trackExperimentConversion(
    experimentKey: string,
    conversionEvent: string,
    properties?: Record<string, unknown>
  ): void {
    this.track('$experiment_converted', {
      experiment: experimentKey,
      conversion_event: conversionEvent,
      ...properties,
    });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let clientInstance: PostHogClient | null = null;

export function getPostHogClient(config?: FeatureFlagsConfig): PostHogClient {
  if (!clientInstance) {
    clientInstance = new PostHogClient(config);
  }
  return clientInstance;
}

export function initFeatureFlags(config?: FeatureFlagsConfig): Promise<void> {
  const client = getPostHogClient(config);
  return client.init();
}

export { PostHogClient };
