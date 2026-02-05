/**
 * Feature Flags Module
 *
 * PostHog-based feature flags and experiments for Seizn.
 *
 * @module lib/feature-flags
 */

// Types
export type {
  FeatureFlagValue,
  FeatureFlag,
  Experiment,
  ExperimentPayload,
  FeatureFlagsConfig,
  FeatureFlagContext,
  FeatureFlagEvent,
  KnownFlags,
  FlagKey,
  FlagValue,
} from './types';

// Client
export {
  PostHogClient,
  getPostHogClient,
  initFeatureFlags,
} from './posthog-client';

// Hooks and Components
export {
  FeatureFlagsProvider,
  useFeatureFlags,
  useFeatureFlag,
  useExperiment,
  useFeatureFlagPayload,
  FeatureGate,
  Experiment as ExperimentComponent,
  type FeatureFlagsProviderProps,
  type UseFeatureFlagOptions,
  type UseFeatureFlagReturn,
  type UseExperimentOptions,
  type UseExperimentReturn,
  type FeatureGateProps,
  type ExperimentProps,
} from './hooks';

// Server-side utilities (import from '@/lib/feature-flags/server' directly)
// Note: Server exports are in a separate file to avoid 'use client' conflicts
