/**
 * Seizn Winter - RTBF (Right to Be Forgotten)
 *
 * GDPR Article 17 "Right to erasure" compliant deletion system
 * with complete audit trail and verification.
 *
 * @module winter/rtbf
 */

// Types
export * from './types';

// Erasure operations
export {
  createRTBFRequest,
  getRTBFRequest,
  updateRTBFRequest,
  analyzeImpact,
  executeErasure,
  cancelRTBFRequest,
  listRTBFRequests,
} from './erasure';

// Audit logging
export {
  createAuditLog,
  updateAuditLog,
  markAuditLogStarted,
  markAuditLogCompleted,
  markAuditLogFailed,
  queryAuditLogs,
  getAuditLog,
  getAuditStatistics,
  generateVerificationHash,
  verifyAuditLogIntegrity,
  generateComplianceReport,
} from './audit';

// Verification
export {
  verifyErasure,
  verifyWithRetry,
  generateDeletionCertificate,
  verifyCompliance,
  runPendingVerifications,
} from './verification';
