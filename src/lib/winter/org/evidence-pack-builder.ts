/**
 * Seizn Winter - Organization Evidence Pack Builder
 *
 * Generates comprehensive evidence packs for compliance audits.
 * Bundles audit logs, reports, policies, and member activity into
 * a single exportable package with digital signatures.
 */

import crypto from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { exportAuditLogs } from './audit-log';
import { generateReport } from './reports';
import { listPolicies } from './policies';
import { listMembers } from './members';
import { Report, ReportType, AuditLogFilter } from './types';

// ============================================
// Types
// ============================================

export type EvidencePackFormat = 'json' | 'zip';

export interface EvidencePackConfig {
  organizationId: string;
  requestedBy: string; // user_id

  // Audit logs configuration
  includeAuditLogs?: boolean;
  auditPeriodStart?: Date;
  auditPeriodEnd?: Date;
  auditActions?: string[];

  // Reports configuration
  includeReports?: ReportType[];
  reportPeriodStart?: Date;
  reportPeriodEnd?: Date;

  // Other data
  includePolicies?: boolean;
  includeMemberActivity?: boolean;
  includeRTBFCertificates?: boolean;

  // Output format
  format?: EvidencePackFormat;
}

export interface EvidencePackManifest {
  packId: string;
  organizationId: string;
  generatedAt: string;
  generatedBy: string;
  format: EvidencePackFormat;
  version: string;

  contents: {
    auditLogs: {
      included: boolean;
      count: number;
      periodStart?: string;
      periodEnd?: string;
    };
    reports: {
      included: ReportType[];
      count: number;
    };
    policies: {
      included: boolean;
      count: number;
    };
    members: {
      included: boolean;
      count: number;
    };
    rtbfCertificates: {
      included: boolean;
      count: number;
    };
  };

  checksums: {
    auditLogs?: string;
    reports?: string;
    policies?: string;
    members?: string;
    rtbfCertificates?: string;
    manifest?: string;
  };

  signature: {
    algorithm: string;
    value: string;
    signedAt: string;
  };
}

export interface EvidencePackResult {
  packId: string;
  manifest: EvidencePackManifest;
  content: string | Buffer;
  filename: string;
  contentType: string;
}

// ============================================
// Evidence Pack Builder
// ============================================

/**
 * Generate a comprehensive evidence pack for an organization
 */
export async function generateEvidencePack(
  config: EvidencePackConfig
): Promise<EvidencePackResult> {
  const supabase = createServerClient();
  const packId = `evp_${crypto.randomUUID().replace(/-/g, '')}`;
  const now = new Date();
  const format = config.format || 'json';

  // Collect all data
  const packData: Record<string, unknown> = {};
  const checksums: Record<string, string> = {};

  // 1. Audit Logs
  let auditLogsCount = 0;
  if (config.includeAuditLogs !== false) {
    const auditFilter: AuditLogFilter = {
      organization_id: config.organizationId,
      start_date: config.auditPeriodStart?.toISOString(),
      end_date: config.auditPeriodEnd?.toISOString(),
      limit: 10000, // Max for export
    };

    const auditLogs = await exportAuditLogs(auditFilter);
    packData.auditLogs = auditLogs;
    auditLogsCount = auditLogs.length;
    checksums.auditLogs = generateChecksum(JSON.stringify(auditLogs));
  }

  // 2. Reports
  const reports: Report[] = [];
  if (config.includeReports && config.includeReports.length > 0) {
    for (const reportType of config.includeReports) {
      try {
        const report = await generateReport({
          organization_id: config.organizationId,
          report_type: reportType,
          period_start: config.reportPeriodStart,
          period_end: config.reportPeriodEnd,
          generated_by: 'user',
        });
        reports.push(report);
      } catch (err) {
        console.error(`Failed to generate report ${reportType}:`, err);
        // Continue with other reports
      }
    }
    packData.reports = reports;
    checksums.reports = generateChecksum(JSON.stringify(reports));
  }

  // 3. Policies
  let policiesCount = 0;
  if (config.includePolicies !== false) {
    const policiesResult = await listPolicies({ organization_id: config.organizationId });
    const policies = policiesResult.data;
    packData.policies = policies;
    policiesCount = policies.length;
    checksums.policies = generateChecksum(JSON.stringify(policies));
  }

  // 4. Members
  let membersCount = 0;
  if (config.includeMemberActivity) {
    const membersResult = await listMembers({ organization_id: config.organizationId });
    const members = membersResult.data;
    // Sanitize member data (remove sensitive fields)
    const sanitizedMembers = members.map((m) => ({
      id: m.id,
      email: m.user?.email,
      role: m.role,
      joinedAt: m.created_at,
    }));
    packData.members = sanitizedMembers;
    membersCount = sanitizedMembers.length;
    checksums.members = generateChecksum(JSON.stringify(sanitizedMembers));
  }

  // 5. RTBF Certificates
  let rtbfCertificatesCount = 0;
  if (config.includeRTBFCertificates) {
    const { data: rtbfRequests } = await supabase
      .from('winter_rtbf_requests')
      .select('id, subject_id, status, completed_at, gdpr_compliant, verification_hash')
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .limit(1000);

    const certificates = (rtbfRequests || []).map((req) => ({
      requestId: req.id,
      subjectId: req.subject_id,
      status: req.status,
      completedAt: req.completed_at,
      gdprCompliant: req.gdpr_compliant,
      verificationHash: req.verification_hash,
    }));

    packData.rtbfCertificates = certificates;
    rtbfCertificatesCount = certificates.length;
    checksums.rtbfCertificates = generateChecksum(JSON.stringify(certificates));
  }

  // Build manifest
  const manifest: EvidencePackManifest = {
    packId,
    organizationId: config.organizationId,
    generatedAt: now.toISOString(),
    generatedBy: config.requestedBy,
    format,
    version: '1.0.0',

    contents: {
      auditLogs: {
        included: config.includeAuditLogs !== false,
        count: auditLogsCount,
        periodStart: config.auditPeriodStart?.toISOString(),
        periodEnd: config.auditPeriodEnd?.toISOString(),
      },
      reports: {
        included: config.includeReports || [],
        count: reports.length,
      },
      policies: {
        included: config.includePolicies !== false,
        count: policiesCount,
      },
      members: {
        included: !!config.includeMemberActivity,
        count: membersCount,
      },
      rtbfCertificates: {
        included: !!config.includeRTBFCertificates,
        count: rtbfCertificatesCount,
      },
    },

    checksums,

    signature: {
      algorithm: 'sha256',
      value: '', // Will be filled after computing
      signedAt: now.toISOString(),
    },
  };

  // Generate manifest checksum
  checksums.manifest = generateChecksum(JSON.stringify({
    packId: manifest.packId,
    organizationId: manifest.organizationId,
    generatedAt: manifest.generatedAt,
    contents: manifest.contents,
  }));
  manifest.checksums = checksums;

  // Generate signature
  manifest.signature.value = generateSignature(manifest);

  // Build final pack
  const fullPack = {
    manifest,
    data: packData,
  };

  // Log evidence pack generation
  await supabase.from('audit_logs').insert({
    user_id: config.requestedBy,
    action: 'winter.evidence_pack.export',
    resource_type: 'evidence_pack',
    resource_id: packId,
    details: {
      organization_id: config.organizationId,
      format,
      contents: manifest.contents,
    },
    status: 'success',
  });

  // Return based on format
  if (format === 'json') {
    return {
      packId,
      manifest,
      content: JSON.stringify(fullPack, null, 2),
      filename: `seizn-evidence-pack-${packId}.json`,
      contentType: 'application/json',
    };
  }

  // For ZIP format, create a simple JSON archive
  // (Full ZIP support would require archiver package)
  const zipContent = Buffer.from(JSON.stringify(fullPack));
  return {
    packId,
    manifest,
    content: zipContent,
    filename: `seizn-evidence-pack-${packId}.zip`,
    contentType: 'application/zip',
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a SHA-256 checksum for data integrity
 */
function generateChecksum(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a signature for the manifest
 */
function generateSignature(manifest: EvidencePackManifest): string {
  const signingKey = process.env.EVIDENCE_PACK_SIGNING_KEY;
  if (!signingKey) {
    throw new Error(
      'EVIDENCE_PACK_SIGNING_KEY must be set before generating evidence pack signatures'
    );
  }

  const signatureInput = JSON.stringify({
    packId: manifest.packId,
    organizationId: manifest.organizationId,
    generatedAt: manifest.generatedAt,
    checksums: manifest.checksums,
  });

  // Use HMAC signing key from environment.

  return crypto
    .createHmac('sha256', signingKey)
    .update(signatureInput)
    .digest('hex');
}

/**
 * Verify an evidence pack's integrity
 */
export function verifyEvidencePackIntegrity(pack: {
  manifest: EvidencePackManifest;
  data: Record<string, unknown>;
}): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Verify each section's checksum
  const { checksums } = pack.manifest;

  if (checksums.auditLogs && pack.data.auditLogs) {
    const computed = generateChecksum(JSON.stringify(pack.data.auditLogs));
    if (computed !== checksums.auditLogs) {
      errors.push('Audit logs checksum mismatch');
    }
  }

  if (checksums.reports && pack.data.reports) {
    const computed = generateChecksum(JSON.stringify(pack.data.reports));
    if (computed !== checksums.reports) {
      errors.push('Reports checksum mismatch');
    }
  }

  if (checksums.policies && pack.data.policies) {
    const computed = generateChecksum(JSON.stringify(pack.data.policies));
    if (computed !== checksums.policies) {
      errors.push('Policies checksum mismatch');
    }
  }

  if (checksums.members && pack.data.members) {
    const computed = generateChecksum(JSON.stringify(pack.data.members));
    if (computed !== checksums.members) {
      errors.push('Members checksum mismatch');
    }
  }

  // Verify signature
  try {
    const expectedSignature = generateSignature(pack.manifest);
    if (expectedSignature !== pack.manifest.signature.value) {
      errors.push('Manifest signature invalid');
    }
  } catch (error) {
    errors.push(
      error instanceof Error
        ? error.message
        : 'EVIDENCE_PACK_SIGNING_KEY is missing for signature verification'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Types Export
// ============================================
