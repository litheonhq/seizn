import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import {
  generateEvidencePack,
  verifyEvidencePackIntegrity,
  type EvidencePackConfig,
  type EvidencePackFormat,
} from '@/lib/winter/org/evidence-pack-builder';
import { ReportType } from '@/lib/winter/org/types';
import { logServerError } from '@/lib/server/logger';

/**
 * POST /api/winter/org/[orgId]/evidence-pack
 *
 * Generate an evidence pack for compliance audits.
 * Requires organization owner or admin role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Verify user has permission (owner or admin)
  const supabase = createServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', session.user.id)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
  }

  if (!['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json(
      { error: 'Only owners and admins can export evidence packs' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    // Parse and validate configuration
    const config: EvidencePackConfig = {
      organizationId: orgId,
      requestedBy: session.user.id,
      includeAuditLogs: body.includeAuditLogs !== false,
      auditPeriodStart: body.auditPeriodStart ? new Date(body.auditPeriodStart) : undefined,
      auditPeriodEnd: body.auditPeriodEnd ? new Date(body.auditPeriodEnd) : undefined,
      auditActions: body.auditActions,
      includeReports: validateReportTypes(body.includeReports),
      reportPeriodStart: body.reportPeriodStart ? new Date(body.reportPeriodStart) : undefined,
      reportPeriodEnd: body.reportPeriodEnd ? new Date(body.reportPeriodEnd) : undefined,
      includePolicies: body.includePolicies !== false,
      includeMemberActivity: body.includeMemberActivity ?? false,
      includeRTBFCertificates: body.includeRTBFCertificates ?? false,
      format: validateFormat(body.format),
    };

    // Generate the evidence pack
    const result = await generateEvidencePack(config);

    // For JSON format, return inline
    if (config.format === 'json') {
      return new NextResponse(result.content as string, {
        status: 200,
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Evidence-Pack-Id': result.packId,
        },
      });
    }

    // For other formats (ZIP), return as binary
    const buffer = result.content as Buffer;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'X-Evidence-Pack-Id': result.packId,
      },
    });
  } catch (error) {
    logServerError('[Evidence Pack] Export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log the failure
    await supabase.from('audit_logs').insert({
      user_id: session.user.id,
      action: 'winter.evidence_pack.export',
      resource_type: 'evidence_pack',
      resource_id: null,
      details: { organizationId: orgId },
      status: 'failed',
      error_message: errorMessage,
    });

    return NextResponse.json(
      { error: 'Failed to generate evidence pack', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * POST /api/winter/org/[orgId]/evidence-pack/verify
 *
 * Verify the integrity of an evidence pack.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { orgId } = await params;

  // Verify user has permission
  const supabase = createServerClient();
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', session.user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
  }

  try {
    const pack = await request.json();

    if (!pack.manifest || !pack.data) {
      return NextResponse.json(
        { error: 'Invalid evidence pack format. Expected { manifest, data }' },
        { status: 400 }
      );
    }

    const verification = verifyEvidencePackIntegrity(pack);

    return NextResponse.json({
      valid: verification.valid,
      errors: verification.errors,
      packId: pack.manifest.packId,
      generatedAt: pack.manifest.generatedAt,
      organizationId: pack.manifest.organizationId,
    });
  } catch (error) {
    logServerError('[Evidence Pack] Verification error:', error);
    return NextResponse.json(
      { error: 'Failed to verify evidence pack' },
      { status: 500 }
    );
  }
}

// ============================================
// Helper Functions
// ============================================

const VALID_REPORT_TYPES: ReportType[] = [
  'usage_monthly',
  'usage_weekly',
  'security_events',
  'compliance_gdpr',
  'compliance_soc2',
  'member_activity',
  'api_usage',
  'cost_analysis',
];

function validateReportTypes(types: unknown): ReportType[] {
  if (!Array.isArray(types)) {
    return [];
  }

  return types.filter((t): t is ReportType =>
    typeof t === 'string' && VALID_REPORT_TYPES.includes(t as ReportType)
  );
}

function validateFormat(format: unknown): EvidencePackFormat {
  if (format === 'zip') {
    return 'zip';
  }
  return 'json'; // Default to JSON
}
