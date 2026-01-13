/**
 * RAG Sentry - Incident Triage + Auto RCA
 *
 * Main entry point for the RAG Sentry module.
 */

// Types
export type {
  IncidentSeverity,
  IncidentStatus,
  ErrorType,
  RCACandidate,
  RCAResult,
  TraceSnapshot,
  Incident,
  IncidentEvent,
  IncidentEventType,
  FingerprintInput,
  FingerprintResult,
  TriggerConfig,
  TriggerInput,
  TriggerResult,
  ListIncidentsParams,
  IncidentSummary,
  IncidentDetail,
} from './types';

export { DEFAULT_TRIGGER_CONFIG } from './types';

// Fingerprint functions
export {
  generateFingerprint,
  generateQueryFingerprint,
  detectErrorType,
  determineSeverity,
  generateIncidentTitle,
} from './fingerprint';

// RCA functions
export {
  analyzeRootCause,
  getFixSuggestions,
  getPrimaryCause,
  summarizeRCA,
} from './rca';

// Auto-trigger functions
export {
  processTrigger,
  processTriggerBatch,
  createTriggerFromTrace,
  createTriggerFromFeedback,
  createTriggerFromEval,
} from './auto-trigger';
