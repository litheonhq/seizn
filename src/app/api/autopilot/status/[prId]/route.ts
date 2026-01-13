/**
 * GET /api/autopilot/status/[prId]
 *
 * Get the status of an autopilot PR.
 *
 * Path Parameters:
 * - prId: The PR record ID (pr-xxx format)
 *
 * Response:
 * {
 *   "success": true,
 *   "prRecord": {...},
 *   "checks": {
 *     "status": "success",
 *     "runs": [...]
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createCodeFixer, DEFAULT_AUTOPILOT_CONFIG } from '@/lib/autopilot';
import type { PRStatusResponse, AutopilotConfig, PRRecord } from '@/lib/autopilot';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ prId: string }> }
) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;
    const { prId } = await params;

    // Check plan allows autopilot
    if (plan === 'free') {
      return NextResponse.json(
        { error: 'Autopilot is not available on the free plan.' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();

    // Fetch PR record
    const { data: prData, error: prError } = await supabase
      .from('autopilot_prs')
      .select('*')
      .eq('id', prId)
      .eq('user_id', userId)
      .single();

    if (prError || !prData) {
      return NextResponse.json(
        { error: 'PR not found' },
        { status: 404 }
      );
    }

    // Convert to PRRecord
    const prRecord: PRRecord = {
      id: prData.id,
      prNumber: prData.pr_number,
      prUrl: prData.pr_url,
      status: prData.status,
      context: prData.context,
      history: prData.history,
      githubResponse: prData.github_response,
      error: prData.error,
      createdAt: prData.created_at,
      updatedAt: prData.updated_at,
    };

    // If PR was created, fetch latest status from GitHub
    let checks;
    if (prRecord.prNumber) {
      const { data: configData } = await supabase
        .from('autopilot_configs')
        .select('config, github_token')
        .eq('user_id', userId)
        .single();

      if (configData?.github_token) {
        const config: AutopilotConfig = {
          ...DEFAULT_AUTOPILOT_CONFIG,
          ...(configData.config as Partial<AutopilotConfig> || {}),
        };

        try {
          const codeFixer = createCodeFixer(config, configData.github_token);
          const statusResult = await codeFixer.getPRStatus(prRecord.prNumber);

          // Update stored status if changed
          if (statusResult.status !== prRecord.status) {
            prRecord.status = statusResult.status;
            prRecord.history.push({
              status: statusResult.status,
              timestamp: new Date().toISOString(),
              actor: 'github',
              details: 'Status synced from GitHub',
            });
            prRecord.updatedAt = new Date().toISOString();

            await supabase
              .from('autopilot_prs')
              .update({
                status: prRecord.status,
                history: prRecord.history,
                updated_at: prRecord.updatedAt,
              })
              .eq('id', prId);
          }

          checks = statusResult.checks;
        } catch (error) {
          console.error('Error fetching GitHub status:', error);
          // Continue without live status
        }
      }
    }

    const response: PRStatusResponse = {
      success: true,
      prRecord,
      checks,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Autopilot status error:', error);
    return ServerErrors.internal('autopilot_status');
  }
}
