/**
 * PII Scanner Module
 *
 * Exports all PII scanning functionality for use in the Write Pipeline.
 */

// Scanner functions and types
export {
  scanForPII,
  maskPII,
  scanAndMask,
  quickPIICheck,
  luhnCheck,
  calculateEntropy,
  type PIIType,
  type PIIMatch,
  type PIIScanResult,
  type ScanOptions,
} from './scanner';

// Policy configuration
export {
  DEFAULT_PII_POLICY,
  getEffectivePolicy,
  getBlockedTypes,
  getMaskedTypes,
  shouldScanNamespace,
  getPIIConfig,
  updatePIIConfig,
  resetPIIConfig,
  setNamespacePolicy,
  removeNamespacePolicy,
  type PIIAction,
  type PIITypePolicy,
  type NamespacePolicy,
  type PIIPolicyConfig,
} from './config';

// Pipeline integration (to be used by memory API)
export { processPIIForWrite, type PIIProcessResult } from './pipeline';
