'use client';

/**
 * Feature Flag Hooks
 *
 * React hooks for feature flags and experiments.
 *
 * @module lib/feature-flags/hooks
 */

import React, { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { getPostHogClient, initFeatureFlags } from './posthog-client';
import type {
  FeatureFlagsConfig,
  FeatureFlagContext,
  FeatureFlagValue,
  FlagKey,
  FlagValue,
  Experiment,
} from './types';

// =============================================================================
// Context
// =============================================================================

interface FeatureFlagsContextValue {
  isReady: boolean;
  getFlag: <K extends FlagKey>(key: K, defaultValue?: FlagValue<K>) => FlagValue<K> | undefined;
  isEnabled: <K extends FlagKey>(key: K) => boolean;
  setOverride: <K extends FlagKey>(key: K, value: FlagValue<K>) => void;
  clearOverride: (key: FlagKey) => void;
  reloadFlags: () => void;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
const _FlagsContext = createContext<FeatureFlagsContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export interface FeatureFlagsProviderProps {
  children: ReactNode;
  config?: FeatureFlagsConfig;
  context?: FeatureFlagContext;
}

export function FeatureFlagsProvider({
  children,
  config,
  context,
}: FeatureFlagsProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const init = async () => {
      await initFeatureFlags(config);
      const client = getPostHogClient();

      if (context) {
        client.identify(context);
      }

      // Subscribe to flag changes
      client.onFlagsLoaded(() => {
        forceUpdate((n) => n + 1);
      });

      setIsReady(true);
    };

    init();
  }, [config, context]);

  const value = useMemo<FeatureFlagsContextValue>(() => {
    const client = getPostHogClient();

    return {
      isReady,
      getFlag: (key, defaultValue) => client.getFlag(key, defaultValue),
      isEnabled: (key) => client.isEnabled(key),
      setOverride: (key, value) => {
        client.setOverride(key, value);
        forceUpdate((n) => n + 1);
      },
      clearOverride: (key) => {
        client.clearOverride(key);
        forceUpdate((n) => n + 1);
      },
      reloadFlags: () => {
        client.reloadFlags();
      },
    };
  }, [isReady]);

  return React.createElement(_FlagsContext.Provider, { value }, children);
}

// =============================================================================
// useFeatureFlags
// =============================================================================

export function useFeatureFlags(): FeatureFlagsContextValue {
  const context = useContext(_FlagsContext);

  if (!context) {
    // Return a default context for use outside provider
    const client = getPostHogClient();
    return {
      isReady: false,
      getFlag: (key, defaultValue) => client.getFlag(key, defaultValue),
      isEnabled: (key) => client.isEnabled(key),
      setOverride: (key, value) => client.setOverride(key, value),
      clearOverride: (key) => client.clearOverride(key),
      reloadFlags: () => client.reloadFlags(),
    };
  }

  return context;
}

// =============================================================================
// useFeatureFlag
// =============================================================================

export interface UseFeatureFlagOptions<K extends FlagKey> {
  /** Flag key */
  key: K;
  /** Default value if flag is not set */
  defaultValue?: FlagValue<K>;
  /** Track exposure automatically */
  trackExposure?: boolean;
}

export interface UseFeatureFlagReturn<K extends FlagKey> {
  value: FlagValue<K> | undefined;
  isEnabled: boolean;
  isLoading: boolean;
}

/**
 * Hook for getting a single feature flag
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { isEnabled, isLoading } = useFeatureFlag({
 *     key: 'new-dashboard-layout',
 *     defaultValue: false,
 *   });
 *
 *   if (isLoading) return <Skeleton />;
 *   return isEnabled ? <NewDashboard /> : <OldDashboard />;
 * }
 * ```
 */
export function useFeatureFlag<K extends FlagKey>(
  options: UseFeatureFlagOptions<K>
): UseFeatureFlagReturn<K> {
  const { key, defaultValue, trackExposure = true } = options;
  const { isReady, getFlag, isEnabled } = useFeatureFlags();
  const [hasTrackedExposure, setHasTrackedExposure] = useState(false);

  const value = getFlag(key, defaultValue);
  const enabled = isEnabled(key);

  // Track exposure once when ready
  useEffect(() => {
    if (isReady && trackExposure && !hasTrackedExposure) {
      const client = getPostHogClient();
      client.track('$feature_flag_called', {
        $feature_flag: key,
        $feature_flag_response: value,
      });
      setHasTrackedExposure(true);
    }
  }, [isReady, key, value, trackExposure, hasTrackedExposure]);

  return {
    value,
    isEnabled: enabled,
    isLoading: !isReady,
  };
}

// =============================================================================
// useExperiment
// =============================================================================

export interface UseExperimentOptions {
  /** Experiment key */
  key: FlagKey;
  /** Available variants */
  variants: string[];
  /** Track exposure automatically */
  trackExposure?: boolean;
}

export interface UseExperimentReturn {
  variant: string;
  isParticipant: boolean;
  isLoading: boolean;
  trackConversion: (event: string, properties?: Record<string, unknown>) => void;
}

/**
 * Hook for experiments/A/B tests
 *
 * @example
 * ```tsx
 * function OnboardingFlow() {
 *   const { variant, trackConversion } = useExperiment({
 *     key: 'onboarding-flow',
 *     variants: ['control', 'variant-a', 'variant-b'],
 *   });
 *
 *   useEffect(() => {
 *     if (onboardingComplete) {
 *       trackConversion('onboarding_completed');
 *     }
 *   }, [onboardingComplete]);
 *
 *   switch (variant) {
 *     case 'variant-a': return <OnboardingA />;
 *     case 'variant-b': return <OnboardingB />;
 *     default: return <OnboardingControl />;
 *   }
 * }
 * ```
 */
export function useExperiment(options: UseExperimentOptions): UseExperimentReturn {
  const { key, variants, trackExposure = true } = options;
  const { isReady, getFlag } = useFeatureFlags();
  const [hasTrackedExposure, setHasTrackedExposure] = useState(false);

  const value = getFlag(key);
  const variant = typeof value === 'string' ? value : 'control';
  const isParticipant = variants.includes(variant);

  // Track exposure
  useEffect(() => {
    if (isReady && trackExposure && !hasTrackedExposure && isParticipant) {
      const client = getPostHogClient();
      client.trackExperimentExposure(key, variant);
      setHasTrackedExposure(true);
    }
  }, [isReady, key, variant, trackExposure, hasTrackedExposure, isParticipant]);

  const trackConversion = useCallback(
    (event: string, properties?: Record<string, unknown>) => {
      const client = getPostHogClient();
      client.trackExperimentConversion(key, event, properties);
    },
    [key]
  );

  return {
    variant,
    isParticipant,
    isLoading: !isReady,
    trackConversion,
  };
}

// =============================================================================
// useFeatureFlagPayload
// =============================================================================

/**
 * Hook for getting feature flag payload data
 *
 * @example
 * ```tsx
 * function BannerComponent() {
 *   const { payload, isLoading } = useFeatureFlagPayload('promo-banner');
 *
 *   if (isLoading || !payload) return null;
 *   return <Banner title={payload.title} color={payload.color} />;
 * }
 * ```
 */
export function useFeatureFlagPayload<K extends FlagKey>(key: K): {
  payload: Record<string, unknown> | undefined;
  isEnabled: boolean;
  isLoading: boolean;
} {
  const { isReady, isEnabled } = useFeatureFlags();
  const [payload, setPayload] = useState<Record<string, unknown> | undefined>();

  useEffect(() => {
    if (isReady) {
      const client = getPostHogClient();
      const flagData = client.getFlagWithPayload(key);
      setPayload(flagData.payload);
    }
  }, [isReady, key]);

  return {
    payload,
    isEnabled: isEnabled(key),
    isLoading: !isReady,
  };
}

// =============================================================================
// Feature Gate Component
// =============================================================================

export interface FeatureGateProps<K extends FlagKey> {
  flag: K;
  children: ReactNode;
  fallback?: ReactNode;
  /** Show fallback while loading */
  loadingFallback?: ReactNode;
}

/**
 * Component for conditionally rendering based on feature flag
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <FeatureGate flag="beta-feature" fallback={<OldFeature />}>
 *       <NewFeature />
 *     </FeatureGate>
 *   );
 * }
 * ```
 */
export function FeatureGate<K extends FlagKey>({
  flag,
  children,
  fallback = null,
  loadingFallback,
}: FeatureGateProps<K>) {
  const { isEnabled, isLoading } = useFeatureFlag({ key: flag });

  if (isLoading) {
    return React.createElement(React.Fragment, null, loadingFallback ?? fallback);
  }

  return React.createElement(React.Fragment, null, isEnabled ? children : fallback);
}

// =============================================================================
// Experiment Component
// =============================================================================

export interface ExperimentProps {
  experimentKey: FlagKey;
  variants: Record<string, ReactNode>;
  fallback?: ReactNode;
}

/**
 * Component for rendering experiment variants
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <Experiment
 *       experimentKey="checkout-flow"
 *       variants={{
 *         control: <CheckoutOld />,
 *         'variant-a': <CheckoutNew />,
 *         'variant-b': <CheckoutSimple />,
 *       }}
 *       fallback={<CheckoutOld />}
 *     />
 *   );
 * }
 * ```
 */
export function Experiment({
  experimentKey,
  variants,
  fallback,
}: ExperimentProps) {
  const { variant, isLoading } = useExperiment({
    key: experimentKey,
    variants: Object.keys(variants),
  });

  if (isLoading) {
    return React.createElement(React.Fragment, null, fallback ?? variants['control'] ?? null);
  }

  return React.createElement(React.Fragment, null, variants[variant] ?? fallback ?? variants['control'] ?? null);
}
