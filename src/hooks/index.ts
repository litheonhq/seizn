/**
 * Hooks Index
 *
 * Exports all custom React hooks for Seizn.
 *
 * @module hooks
 */

// Realtime hooks
export {
  useRealtimeMemories,
  useRealtimeMemory,
} from './useRealtimeMemories';

export {
  useRealtimeTable,
  useRealtimeData,
  type UseRealtimeTableOptions,
  type UseRealtimeTableReturn,
  type RealtimeChange,
} from './useRealtimeTable';

export {
  useRealtimeCandidates,
  type UseRealtimeCandidatesOptions,
  type UseRealtimeCandidatesReturn,
  type CandidateChange,
} from './useRealtimeCandidates';

export {
  usePresence,
  useMemoryViewers,
  useTypingIndicator,
  type UsePresenceOptions,
  type UsePresenceReturn,
} from './usePresence';

export {
  useUsageEvents,
  useMemoryUsage,
  type UseUsageEventsOptions,
  type UseUsageEventsReturn,
  type UsageStats,
} from './useUsageEvents';

// Offline hooks
export {
  useOffline,
  useIsOnline,
  type UseOfflineOptions,
  type UseOfflineReturn,
} from './useOffline';

// Accessibility hooks
export {
  useFocusTrap,
  useAnnounce,
  useReducedMotion,
  useRovingTabindex,
  useEscapeKey,
  useAriaLive,
  type UseRovingTabindexOptions,
} from './useA11y';

// Graph renderer hooks
export {
  useGraphRenderer,
  type UseGraphRendererOptions,
  type UseGraphRendererReturn,
} from './useGraphRenderer';

// Telemetry hooks
export {
  useTelemetry,
  usePageViewTelemetry,
  useSpan,
  useErrorBoundaryTelemetry,
  useInteractionTelemetry,
  type UseTelemetryOptions,
  type UsePageViewOptions,
  type UseSpanOptions,
  type UseInteractionTelemetryOptions,
} from './useTelemetry';

// Feature flags hooks
export {
  useFeatureFlags,
  useFeatureFlag,
  useExperiment,
  useFeatureFlagPayload,
  FeatureGate,
  Experiment,
  type UseFeatureFlagOptions,
  type UseFeatureFlagReturn,
  type UseExperimentOptions,
  type UseExperimentReturn,
  type FeatureGateProps,
  type ExperimentProps,
} from './useFeatureFlags';

// Other hooks
export { useLocale } from './useLocale';
export { useReviewMode } from './useReviewMode';
