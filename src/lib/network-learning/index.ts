/**
 * C3: Consent-Aware Network Learning
 *
 * Privacy-preserving network learning for Seizn.
 * Collects anonymized signals from consented users to improve system performance.
 */

// Types
export type {
  ConsentStatus,
  SignalType,
  UserConsent,
  ConsentRecord,
  AnonymizedSignal,
  SignalRecord,
  AggregationPeriod,
  AggregatedInsight,
  InsightRecord,
  PolicyUpdate,
  PolicyUpdateRecord,
  NetworkLearningConfig,
  ConsentResponse,
  InsightsResponse,
  PolicyResponse,
} from './types';

export { DEFAULT_NETWORK_LEARNING_CONFIG } from './types';

// Consent Management
export {
  getConsent,
  getEffectiveConsent,
  optIn,
  optOut,
  updateDataTypes,
  hasConsent,
  hasAllConsents,
  getConsentedUsers,
  getAvailableSignalTypes,
} from './consent/consent-manager';

// Signal Collection
export {
  collectSignal,
  collectBatchSignals,
  getSignals,
  getSignalCount,
} from './collection/signal-collector';

export type {
  CollectSignalInput,
  GetSignalsOptions,
} from './collection/signal-collector';

// Aggregation
export {
  aggregateSignals,
  storeInsights,
  getInsights,
  getLatestInsight,
  analyzeTrends,
  runScheduledAggregation,
} from './aggregation/aggregator';

export type { TrendAnalysis } from './aggregation/aggregator';

// Policy Updates
export {
  generatePolicyRecommendations,
  createPolicyUpdate,
  getPendingUpdates,
  getPolicyUpdates,
  approvePolicyUpdate,
  rejectPolicyUpdate,
  applyPolicyUpdate,
  createABTestConfig,
  runScheduledPolicyGeneration,
} from './policy/policy-updater';

export type {
  PolicyRecommendation,
  ABTestConfig,
} from './policy/policy-updater';

// Eval -> Policy closed loop
export {
  runEvalPolicyClosedLoop,
} from './policy/eval-closed-loop';

export type {
  EvalPolicyClosedLoopConfig,
  EvalPolicyClosedLoopResult,
} from './policy/eval-closed-loop';
