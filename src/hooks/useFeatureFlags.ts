'use client';

/**
 * Feature Flags Hook
 *
 * Re-export of feature flags hooks for convenience.
 *
 * @module hooks/useFeatureFlags
 */

export {
  useFeatureFlags,
  useFeatureFlag,
  useExperiment,
  useFeatureFlagPayload,
  FeatureGate,
  ExperimentComponent as Experiment,
  type UseFeatureFlagOptions,
  type UseFeatureFlagReturn,
  type UseExperimentOptions,
  type UseExperimentReturn,
  type FeatureGateProps,
  type ExperimentProps,
} from '@/lib/feature-flags';
