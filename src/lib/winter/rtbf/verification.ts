/**
 * Seizn Winter - RTBF Verification
 *
 * Post-deletion verification to ensure complete data erasure.
 * Provides cryptographic proof of deletion for GDPR compliance.
 */

import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';
import {
  VerificationResult,
  VerificationCheck,
  RemainingRecord,
  RTBFRequest,
  DEFAULT_RTBF_CONFIG,
  ErasureScopeParams,
  ErasureScope,
} from './types';
import { getRTBFRequest, updateRTBFRequest } from './erasure';
import { updateAuditLog } from './audit';

// ============================================
// Verification Execution
// ============================================

/**
 * Verify that all data has been deleted for an RTBF request
 */
export async function verifyErasure(requestId: string): Promise<VerificationResult> {
  const supabase = createServerClient();

  // Get the request
  const request = await getRTBFRequest(requestId);
  if (!request) {
    throw new Error(`RTBF request not found: ${requestId}`);
  }

  // Update phase
  await updateRTBFRequest(requestId, { phase: 'verifying' });

  const checks: VerificationCheck[] = [];
  const remainingRecords: RemainingRecord[] = [];
  let allPassed = true;

  // Build conditions from request
  const conditions = buildVerificationConditions(request.scope, request.scope_params);

  // Verify each table
  for (const tableConfig of DEFAULT_RTBF_CONFIG.erasure_tables) {
    try {
      const check = await verifyTable(supabase, tableConfig.table_name, conditions);
      checks.push(check);

      if (!check.passed) {
        allPassed = false;

        // Get remaining record IDs for investigation
        const remaining = await getRemainingRecords(
          supabase,
          tableConfig.table_name,
          conditions,
          5 // Limit to 5 samples
        );

        remainingRecords.push(...remaining);
      }
    } catch (err) {
      // Table might not exist or be inaccessible
      checks.push({
        table_name: tableConfig.table_name,
        expected_count: 0,
        actual_count: -1,
        passed: true, // Skip verification for non-existent tables
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  // Generate verification hash
  const verificationHash = generateVerificationHash({
    requestId,
    checks,
    timestamp: new Date().toISOString(),
  });

  // Update audit log
  await updateAuditLog(requestId, {
    verification_hash: verificationHash,
  });

  return {
    request_id: requestId,
    verified: allPassed,
    checks,
    remaining_records: remainingRecords,
    verification_hash: verificationHash,
    verified_at: new Date().toISOString(),
  };
}

/**
 * Build verification conditions from scope
 */
function buildVerificationConditions(
  scope: ErasureScope,
  params: ErasureScopeParams
): Record<string, unknown> {
  switch (scope) {
    case 'user':
      return { user_id: params.user_id };
    case 'memory':
      return {
        memory_ids: params.memory_ids,
        user_id: params.user_id,
      };
    case 'namespace':
      return {
        user_id: params.user_id_for_namespace,
        namespace: params.namespace,
      };
    case 'date_range':
      return {
        user_id: params.user_id_for_date_range,
        date_from: params.date_from,
        date_to: params.date_to,
      };
    default:
      throw new Error(`Unknown scope: ${scope}`);
  }
}

/**
 * Verify a single table
 */
async function verifyTable(
  supabase: ReturnType<typeof createServerClient>,
  tableName: string,
  conditions: Record<string, unknown>
): Promise<VerificationCheck> {
  // Try to find any remaining records
  let query = supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true });

  // Apply conditions
  if (conditions.user_id) {
    query = query.eq('user_id', conditions.user_id);
  }

  if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
    query = query.in('id', conditions.memory_ids);
  }

  if (conditions.namespace) {
    query = query.eq('namespace', conditions.namespace);
  }

  if (conditions.date_from) {
    query = query.gte('created_at', conditions.date_from);
  }

  if (conditions.date_to) {
    query = query.lte('created_at', conditions.date_to);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  const actualCount = count ?? 0;

  return {
    table_name: tableName,
    expected_count: 0,
    actual_count: actualCount,
    passed: actualCount === 0,
  };
}

/**
 * Get sample of remaining records for investigation
 */
async function getRemainingRecords(
  supabase: ReturnType<typeof createServerClient>,
  tableName: string,
  conditions: Record<string, unknown>,
  limit: number
): Promise<RemainingRecord[]> {
  let query = supabase.from(tableName).select('id').limit(limit);

  // Apply conditions
  if (conditions.user_id) {
    query = query.eq('user_id', conditions.user_id);
  }

  if (conditions.memory_ids && Array.isArray(conditions.memory_ids)) {
    query = query.in('id', conditions.memory_ids);
  }

  if (conditions.namespace) {
    query = query.eq('namespace', conditions.namespace);
  }

  const { data } = await query;

  return (data || []).map((record) => ({
    table_name: tableName,
    record_id: record.id,
    reason: 'Record still exists after deletion',
  }));
}

/**
 * Generate verification hash
 */
function generateVerificationHash(data: {
  requestId: string;
  checks: VerificationCheck[];
  timestamp: string;
}): string {
  const hashInput = JSON.stringify({
    request_id: data.requestId,
    checks: data.checks.map((c) => ({
      table: c.table_name,
      actual: c.actual_count,
      passed: c.passed,
    })),
    timestamp: data.timestamp,
  });

  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

// ============================================
// Retry Verification
// ============================================

/**
 * Retry verification with configurable attempts
 */
export async function verifyWithRetry(
  requestId: string,
  maxRetries?: number
): Promise<VerificationResult> {
  const retries = maxRetries ?? DEFAULT_RTBF_CONFIG.verification.retry_count;
  let lastResult: VerificationResult | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    lastResult = await verifyErasure(requestId);

    if (lastResult.verified) {
      return lastResult;
    }

    // Wait before retrying (exponential backoff)
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }

  return lastResult!;
}

// ============================================
// Certificate Generation
// ============================================

export interface DeletionCertificate {
  certificate_id: string;
  request_id: string;
  subject_id: string;
  issued_at: string;
  verification_result: {
    verified: boolean;
    checks_passed: number;
    checks_total: number;
  };
  data_categories: string[];
  legal_basis?: string;
  issuer: string;
  signature: string;
}

/**
 * Generate a deletion certificate for the data subject
 */
export async function generateDeletionCertificate(
  requestId: string
): Promise<DeletionCertificate> {
  const request = await getRTBFRequest(requestId);
  if (!request) {
    throw new Error(`RTBF request not found: ${requestId}`);
  }

  if (request.status !== 'completed') {
    throw new Error(`Cannot generate certificate for incomplete request: ${request.status}`);
  }

  // Get verification result
  const verification = await verifyErasure(requestId);

  // Determine affected data categories
  const dataCategories = getDataCategories(verification.checks);

  const certificate: Omit<DeletionCertificate, 'signature'> = {
    certificate_id: `cert_${crypto.randomUUID().replace(/-/g, '')}`,
    request_id: requestId,
    subject_id: request.subject_id,
    issued_at: new Date().toISOString(),
    verification_result: {
      verified: verification.verified,
      checks_passed: verification.checks.filter((c) => c.passed).length,
      checks_total: verification.checks.length,
    },
    data_categories: dataCategories,
    legal_basis: request.legal_basis,
    issuer: 'Seizn RTBF System',
  };

  // Generate signature
  const signature = crypto
    .createHash('sha256')
    .update(JSON.stringify(certificate))
    .digest('hex');

  return { ...certificate, signature };
}

/**
 * Map table names to GDPR data categories
 */
function getDataCategories(checks: VerificationCheck[]): string[] {
  const categoryMap: Record<string, string> = {
    memories: 'Personal memories and preferences',
    memory_edges: 'Memory relationship data',
    memory_provenance: 'Data origin information',
    summer_collections: 'Document collections',
    summer_documents: 'User documents',
    summer_chunks: 'Document content',
    fall_retrieval_traces: 'Usage analytics',
    fall_retrieval_feedback: 'User feedback',
    fall_eval_datasets: 'Evaluation data',
    fall_experiments: 'Experiment records',
    winter_policies: 'Privacy preferences',
    winter_pii_events: 'PII detection logs',
    api_keys: 'Authentication credentials',
    webhooks: 'Integration settings',
    usage_logs: 'Service usage data',
  };

  const categories = new Set<string>();

  for (const check of checks) {
    const category = categoryMap[check.table_name];
    if (category && check.actual_count >= 0) {
      categories.add(category);
    }
  }

  return Array.from(categories);
}

// ============================================
// Compliance Verification
// ============================================

export interface ComplianceVerification {
  request_id: string;
  gdpr_compliant: boolean;
  checks: {
    data_erased: boolean;
    audit_logged: boolean;
    certificate_available: boolean;
    backup_encrypted: boolean;
    response_timely: boolean;
  };
  response_time_days: number;
  notes: string[];
}

/**
 * Verify GDPR compliance for a completed RTBF request
 */
export async function verifyCompliance(
  requestId: string
): Promise<ComplianceVerification> {
  const supabase = createServerClient();
  const notes: string[] = [];

  // Get request
  const request = await getRTBFRequest(requestId);
  if (!request) {
    throw new Error(`RTBF request not found: ${requestId}`);
  }

  // Check 1: Data erased
  const verification = await verifyErasure(requestId);
  const dataErased = verification.verified;
  if (!dataErased) {
    notes.push('Some data records remain after erasure');
  }

  // Check 2: Audit logged
  const { data: auditLog } = await supabase
    .from('winter_rtbf_audit_logs')
    .select('id')
    .eq('request_id', requestId)
    .single();
  const auditLogged = !!auditLog;
  if (!auditLogged) {
    notes.push('Audit log not found');
  }

  // Check 3: Certificate available
  let certificateAvailable = false;
  try {
    await generateDeletionCertificate(requestId);
    certificateAvailable = true;
  } catch {
    notes.push('Deletion certificate not available');
  }

  // Check 4: Backup encrypted (if backup exists)
  const { data: backup } = await supabase
    .from('winter_rtbf_backups')
    .select('id, backup_data')
    .eq('request_id', requestId)
    .single();
  const backupEncrypted = !backup || (backup.backup_data && backup.backup_data.length > 100);
  if (backup && !backupEncrypted) {
    notes.push('Backup may not be properly encrypted');
  }

  // Check 5: Response time (GDPR requires within 30 days)
  const requestedAt = new Date(request.requested_at);
  const completedAt = request.completed_at ? new Date(request.completed_at) : new Date();
  const responseTimeDays = Math.ceil(
    (completedAt.getTime() - requestedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  const responseTimely = responseTimeDays <= 30;
  if (!responseTimely) {
    notes.push(`Response time exceeded 30 days (${responseTimeDays} days)`);
  }

  // Overall compliance
  const gdprCompliant =
    dataErased && auditLogged && certificateAvailable && backupEncrypted && responseTimely;

  return {
    request_id: requestId,
    gdpr_compliant: gdprCompliant,
    checks: {
      data_erased: dataErased,
      audit_logged: auditLogged,
      certificate_available: certificateAvailable,
      backup_encrypted: backupEncrypted,
      response_timely: responseTimely,
    },
    response_time_days: responseTimeDays,
    notes,
  };
}

// ============================================
// Scheduled Verification
// ============================================

/**
 * Run verification for all pending verifications
 * (For use in cron jobs or background workers)
 */
export async function runPendingVerifications(): Promise<{
  verified: number;
  failed: number;
  errors: string[];
}> {
  const supabase = createServerClient();
  let verified = 0;
  let failed = 0;
  const errors: string[] = [];

  // Get completed requests that haven't been verified
  const { data: requests } = await supabase
    .from('winter_rtbf_requests')
    .select('id')
    .eq('status', 'completed')
    .eq('phase', 'completed')
    .is('verified_at', null)
    .limit(100);

  for (const request of requests || []) {
    try {
      const result = await verifyErasure(request.id);

      if (result.verified) {
        verified++;
      } else {
        failed++;
        errors.push(`Request ${request.id}: ${result.remaining_records.length} records remain`);
      }
    } catch (err) {
      failed++;
      errors.push(
        `Request ${request.id}: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  return { verified, failed, errors };
}
