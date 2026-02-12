import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runPendingVerifications, verifyCompliance } from '@/lib/winter/rtbf/verification';
import { verifyCronSecret } from '@/lib/cron-auth';

// Configuration
const BATCH_SIZE = 50; // Verify up to 50 requests per cron run
const COMPLIANCE_CHECK_BATCH = 10; // Run compliance checks for recent completions

/**
 * GET /api/cron/winter/rtbf/verify-pending
 *
 * Verify completed RTBF deletions and run compliance checks.
 * Should be called periodically (e.g., daily) via cron.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const now = new Date();

  const results = {
    verification: {
      verified: 0,
      failed: 0,
      errors: [] as string[],
    },
    compliance: {
      checked: 0,
      compliant: 0,
      non_compliant: 0,
      issues: [] as { request_id: string; notes: string[] }[],
    },
  };

  try {
    const supabase = createServerClient();

    // Step 1: Run pending verifications
    console.log('[RTBF Verify] Running pending verifications...');
    const verificationResults = await runPendingVerifications();

    results.verification.verified = verificationResults.verified;
    results.verification.failed = verificationResults.failed;
    results.verification.errors = verificationResults.errors;

    // Update verified requests
    if (verificationResults.verified > 0) {
      const { data: verifiedRequests } = await supabase
        .from('winter_rtbf_requests')
        .select('id')
        .eq('status', 'completed')
        .eq('phase', 'verifying')
        .limit(BATCH_SIZE);

      for (const req of verifiedRequests || []) {
        // Use direct update for verified_at (not in updateRTBFRequest signature)
        await supabase
          .from('winter_rtbf_requests')
          .update({
            phase: 'completed',
            verified_at: now.toISOString(),
          })
          .eq('id', req.id);
      }
    }

    // Step 2: Run compliance checks on recent completions
    console.log('[RTBF Verify] Running compliance checks...');

    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: recentCompletions } = await supabase
      .from('winter_rtbf_requests')
      .select('id')
      .eq('status', 'completed')
      .gte('completed_at', oneWeekAgo.toISOString())
      .is('compliance_checked_at', null)
      .order('completed_at', { ascending: true })
      .limit(COMPLIANCE_CHECK_BATCH);

    for (const request of recentCompletions || []) {
      results.compliance.checked++;

      try {
        const compliance = await verifyCompliance(request.id);

        if (compliance.gdpr_compliant) {
          results.compliance.compliant++;
        } else {
          results.compliance.non_compliant++;
          results.compliance.issues.push({
            request_id: request.id,
            notes: compliance.notes,
          });
        }

        // Update request with compliance check timestamp
        await supabase
          .from('winter_rtbf_requests')
          .update({
            compliance_checked_at: now.toISOString(),
            gdpr_compliant: compliance.gdpr_compliant,
          })
          .eq('id', request.id);
      } catch (err) {
        console.error(`[RTBF Verify] Compliance check failed for ${request.id}:`, err);
        results.compliance.issues.push({
          request_id: request.id,
          notes: [err instanceof Error ? err.message : 'Unknown error'],
        });
      }
    }

    // Step 3: Alert on non-compliance (if any)
    if (results.compliance.non_compliant > 0) {
      // Log alert for monitoring
      await supabase.from('audit_logs').insert({
        user_id: null, // System action
        action: 'system.rtbf_compliance_alert',
        resource_type: 'winter_rtbf_requests',
        resource_id: null,
        details: {
          non_compliant_count: results.compliance.non_compliant,
          issues: results.compliance.issues,
        },
        status: 'warning',
      });

      console.warn(
        `[RTBF Verify] ALERT: ${results.compliance.non_compliant} RTBF requests are non-compliant`
      );
    }

    const duration = Date.now() - startTime;

    // Log cron execution
    await supabase.from('audit_logs').insert({
      user_id: null, // System action
      action: 'system.rtbf_verification_cron',
      resource_type: 'winter_rtbf_requests',
      resource_id: null,
      details: {
        verification: results.verification,
        compliance: {
          checked: results.compliance.checked,
          compliant: results.compliance.compliant,
          non_compliant: results.compliance.non_compliant,
        },
        duration_ms: duration,
      },
      status: results.verification.failed > 0 || results.compliance.non_compliant > 0 ? 'warning' : 'success',
    });

    console.log(
      `[RTBF Verify] Completed: ${results.verification.verified} verified, ` +
        `${results.verification.failed} failed, ${results.compliance.compliant}/${results.compliance.checked} compliant`
    );

    return NextResponse.json({
      success: true,
      results,
      duration_ms: duration,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[RTBF Verify] Cron error:', errorMessage);

    // Log the failure
    try {
      const supabase = createServerClient();
      await supabase.from('audit_logs').insert({
        user_id: null,
        action: 'system.rtbf_verification_cron',
        resource_type: 'winter_rtbf_requests',
        resource_id: null,
        details: {},
        status: 'failed',
        error_message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
