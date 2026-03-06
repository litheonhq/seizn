/**
 * POST /api/autopilot/pr
 *
 * Create a GitHub PR from fix context.
 *
 * Request Body:
 * {
 *   "context": {...},            // Required: PR context from /api/autopilot/fix
 *   "reviewers": ["username"],   // Optional: Override reviewers
 *   "labels": ["label"],         // Optional: Override labels
 *   "draft": boolean             // Optional: Create as draft PR
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "prRecord": {
 *     "id": "pr-xxx",
 *     "prNumber": 123,
 *     "prUrl": "https://github.com/...",
 *     "status": "created"
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ServerErrors, ValidationErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';
import { createCodeFixer, DEFAULT_AUTOPILOT_CONFIG } from '@/lib/autopilot';
import type { CreatePRRequest, CreatePRResponse, AutopilotConfig, PRContext } from '@/lib/autopilot';
import { logServerError } from '@/lib/server/logger';

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, plan } = authResult;

    // Check plan allows autopilot
    if (plan === 'free') {
      return NextResponse.json(
        { error: 'Autopilot is not available on the free plan. Please upgrade to Pro or Enterprise.' },
        { status: 403 }
      );
    }

    // Parse request body
    let body: CreatePRRequest;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate required fields
    if (!body.context) {
      return ValidationErrors.missingField('context');
    }

    const supabase = createServerClient();

    // Get user's autopilot config
    const { data: configData } = await supabase
      .from('autopilot_configs')
      .select('config, github_token')
      .eq('user_id', userId)
      .single();

    if (!configData?.github_token) {
      return NextResponse.json(
        {
          error: 'GitHub token not configured. Please connect your GitHub account in the dashboard.',
          hint: 'Go to Settings -> Autopilot -> Connect GitHub',
        },
        { status: 400 }
      );
    }

    const config: AutopilotConfig = {
      ...DEFAULT_AUTOPILOT_CONFIG,
      ...(configData.config as Partial<AutopilotConfig> || {}),
    };

    // Validate config
    if (!config.owner || !config.repo) {
      return NextResponse.json(
        {
          error: 'Autopilot repository not configured',
          hint: 'Go to Settings -> Autopilot -> Configure Repository',
        },
        { status: 400 }
      );
    }

    const repoFullName = `${config.owner}/${config.repo}`;

    // Check daily PR limit
    const today = new Date().toISOString().slice(0, 10);
    const { count: todayPrCount } = await supabase
      .from('autopilot_prs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `${today}T00:00:00Z`);

    if ((todayPrCount || 0) >= config.maxPrsPerDay) {
      return NextResponse.json(
        {
          error: `Daily PR limit reached (${config.maxPrsPerDay} per day)`,
          hint: 'Try again tomorrow or increase limit in settings',
        },
        { status: 429 }
      );
    }

    // Apply overrides
    const prContext: PRContext = {
      ...body.context,
      metadata: {
        ...body.context.metadata,
        userId, // Trust the authenticated userId over client-provided metadata.
        repoFullName,
      },
      reviewers: body.reviewers || body.context.reviewers,
      labels: body.labels || body.context.labels,
      draft: body.draft !== undefined ? body.draft : body.context.draft,
    };

    // Create PR
    const codeFixer = createCodeFixer(config, configData.github_token);
    const prRecord = await codeFixer.applyFixes(prContext);

    const traceId = prRecord.context.metadata.traceId;

    // Attempt to link the most recent fix for this trace.
    const { data: fixRows } = await supabase
      .from('autopilot_fixes')
      .select('id')
      .eq('user_id', userId)
      .eq('trace_id', traceId)
      .order('created_at', { ascending: false })
      .limit(1);

    const fixId = Array.isArray(fixRows) ? fixRows[0]?.id : null;

    // Store PR record
    await supabase
      .from('autopilot_prs')
      .insert({
        id: prRecord.id,
        user_id: userId,
        analysis_id: traceId,
        fix_id: fixId ?? null,
        pr_type: 'code_fix',
        title: prRecord.context.title,
        description: prRecord.context.body,
        files_changed: prRecord.context.files.map((f) => ({
          path: f.path,
          changeType: f.changeType,
        })),
        external_provider: 'github',
        external_pr_id: prRecord.prNumber ? String(prRecord.prNumber) : null,
        external_pr_url: prRecord.prUrl ?? null,

        trace_id: traceId,
        pr_number: prRecord.prNumber,
        pr_url: prRecord.prUrl,
        status: prRecord.status,
        context: prRecord.context,
        history: prRecord.history,
        error: prRecord.error,
        github_response: prRecord.githubResponse,
        created_at: prRecord.createdAt,
        updated_at: prRecord.updatedAt,
      });

    // Update fix status
    if (fixId) {
      const now = new Date().toISOString();
      const fixUpdate: Record<string, unknown> = {
        pr_id: prRecord.id,
        updated_at: now,
      };

      if (prRecord.status === 'failed') {
        fixUpdate.status = 'rejected';
        fixUpdate.rollback_reason = prRecord.error || 'PR creation failed';
      } else {
        fixUpdate.status = 'applied';
        fixUpdate.applied_at = now;
        fixUpdate.applied_by = 'system';
      }

      await supabase
        .from('autopilot_fixes')
        .update(fixUpdate)
        .eq('id', fixId)
        .eq('user_id', userId);
    }

    const response: CreatePRResponse = {
      success: prRecord.status !== 'failed',
      prRecord,
    };

    return NextResponse.json(response, {
      status: prRecord.status === 'failed' ? 500 : 200,
    });
  } catch (error) {
    logServerError('Autopilot PR create error', error);
    return ServerErrors.internal('autopilot_pr_create');
  }
}
