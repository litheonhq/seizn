/**
 * POST /api/webhooks/github
 *
 * Handle GitHub webhook events for Autopilot integration.
 *
 * Supported Events:
 * - pull_request: PR opened, closed, merged, reviewed
 * - pull_request_review: Review submitted
 * - check_suite: Check suite completed
 * - check_run: Check run completed
 *
 * Headers:
 * - X-GitHub-Event: Event type
 * - X-GitHub-Delivery: Delivery ID
 * - X-Hub-Signature-256: HMAC signature
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { createCodeFixer, DEFAULT_AUTOPILOT_CONFIG } from '@/lib/autopilot';
import type { AutopilotConfig, PRStatus, WebhookPayload, GitHubWebhookEvent } from '@/lib/autopilot';
import { extractCheckSuiteHeadBranch, extractCheckSuitePRNumbers } from '@/lib/autopilot/github-webhook';
import { matchesRepoFullName } from '@/lib/autopilot/github-webhook-reconcile';

// Webhook secret from environment
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

type AutopilotPrRow = {
  id: string;
  user_id: string;
  pr_number: number;
  status: PRStatus;
  history: unknown[];
  context: Record<string, unknown>;
};

/**
 * Verify GitHub webhook signature
 */
function verifySignature(payload: string, signature: string): boolean {
  if (!GITHUB_WEBHOOK_SECRET) {
    console.warn('GITHUB_WEBHOOK_SECRET not configured');
    return false;
  }

  const expected = `sha256=${createHmac('sha256', GITHUB_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

async function findAutopilotPrByNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  prNumber: number,
  repoFullName: string
): Promise<AutopilotPrRow | null> {
  const { data: prData } = await supabase
    .from('autopilot_prs')
    .select('*')
    .eq('pr_number', prNumber)
    .contains('context', { metadata: { repoFullName } })
    .limit(1)
    .maybeSingle();

  if (prData) {
    return prData as AutopilotPrRow;
  }

  const { data: candidates } = await supabase
    .from('autopilot_prs')
    .select('*')
    .eq('pr_number', prNumber);

  if (!Array.isArray(candidates)) {
    return null;
  }

  const match = (candidates as Record<string, unknown>[]).find((row) =>
    matchesRepoFullName(row, repoFullName)
  );

  return (match as AutopilotPrRow) || null;
}

export async function POST(request: NextRequest) {
  try {
    const eventTypeHeader = request.headers.get('X-GitHub-Event');
    const deliveryId = (request.headers.get('X-GitHub-Delivery') || '').trim();
    const signature = (request.headers.get('X-Hub-Signature-256') || '').trim();

    if (!eventTypeHeader) {
      return NextResponse.json(
        { error: 'Missing X-GitHub-Event header' },
        { status: 400 }
      );
    }

    if (!deliveryId) {
      return NextResponse.json(
        { error: 'Missing X-GitHub-Delivery header' },
        { status: 400 }
      );
    }

    const eventType = eventTypeHeader as GitHubWebhookEvent;

    // Get raw body for signature verification
    const rawBody = await request.text();
    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Verify signature
    const signatureValid = verifySignature(rawBody, signature);

    if (!signatureValid) {
      console.warn('Invalid GitHub webhook signature', { deliveryId, eventType });
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Extract repository info
    const repository = payload.repository as Record<string, unknown> | undefined;
    if (!repository) {
      return NextResponse.json(
        { error: 'Missing repository in payload' },
        { status: 400 }
      );
    }

    const repoFullName = repository.full_name as string;
    const [owner, repo] = repoFullName.split('/');

    // Create webhook record
    const webhookPayload: WebhookPayload = {
      event: eventType,
      deliveryId,
      repository: {
        owner,
        name: repo,
        fullName: repoFullName,
      },
      payload,
      signatureValid,
      receivedAt: new Date().toISOString(),
    };

    const supabase = createServerClient();

    // Idempotency: if we've already processed this delivery, return the stored result.
    const { data: existingWebhook } = await supabase
      .from('autopilot_webhooks')
      .select('processed, result')
      .eq('id', deliveryId)
      .maybeSingle();

    if (existingWebhook?.processed) {
      return NextResponse.json({
        success: true,
        event: eventType,
        deliveryId,
        result: existingWebhook.result || { processed: true, action: 'duplicate' },
        deduped: true,
      });
    }

    // Store webhook event (upsert so retries don't fail on PK conflicts).
    await supabase
      .from('autopilot_webhooks')
      .upsert(
        {
          id: deliveryId,
          event: eventType,
          repository: repoFullName,
          payload: webhookPayload,
          processed: false,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

    // Handle event based on type
    let result: { processed: boolean; action?: string; error?: string } = { processed: false };

    switch (eventType) {
      case 'pull_request':
        result = await handlePullRequestEvent(payload, owner, repo, supabase);
        break;
      case 'pull_request_review':
        result = await handlePullRequestReviewEvent(payload, owner, repo, supabase);
        break;
      case 'check_suite':
        result = await handleCheckSuiteEvent(payload, owner, repo, supabase);
        break;
      case 'check_run':
        result = await handleCheckRunEvent(payload, owner, repo, supabase);
        break;
      default:
        result = { processed: false, action: 'ignored' };
    }

    // Update webhook record
    await supabase
      .from('autopilot_webhooks')
      .update({
        processed: result.processed,
        result: result,
        processed_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);

    return NextResponse.json({
      success: true,
      event: eventType,
      deliveryId,
      result,
    });
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Handle pull_request event
 */
async function handlePullRequestEvent(
  payload: Record<string, unknown>,
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ processed: boolean; action?: string; error?: string }> {
  const action = payload.action as string;
  const pullRequest = payload.pull_request as Record<string, unknown>;
  const prNumber = pullRequest.number as number;
  const headBranch = (pullRequest.head as Record<string, unknown> | undefined)?.ref as string | undefined;
  const repoFullName = `${owner}/${repo}`;

  // Find matching autopilot PR
  const prData = await findAutopilotPrByNumber(supabase, prNumber, repoFullName);

  if (!prData) {
    // Not an autopilot PR
    return { processed: false, action: 'not_autopilot_pr' };
  }

  let newStatus: PRStatus | null = null;

  switch (action) {
    case 'opened':
      newStatus = 'created';
      break;
    case 'closed':
      newStatus = pullRequest.merged ? 'merged' : 'closed';
      break;
    case 'reopened':
      newStatus = 'created';
      break;
    case 'review_requested':
      newStatus = 'review_requested';
      break;
  }

  if (newStatus && newStatus !== prData.status) {
    const history = [...prData.history, {
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor: 'github',
      details: `PR ${action}`,
    }];

    await supabase
      .from('autopilot_prs')
      .update({
        status: newStatus,
        history,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prData.id);

    // If merged, clean up branch
    if (newStatus === 'merged') {
      await cleanupAfterMerge(prData, owner, repo, supabase, headBranch);
    }
  }

  return { processed: true, action };
}

/**
 * Handle pull_request_review event
 */
async function handlePullRequestReviewEvent(
  payload: Record<string, unknown>,
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ processed: boolean; action?: string; error?: string }> {
  const action = payload.action as string;
  const review = payload.review as Record<string, unknown>;
  const pullRequest = payload.pull_request as Record<string, unknown>;
  const prNumber = pullRequest.number as number;
  const repoFullName = `${owner}/${repo}`;

  if (action !== 'submitted') {
    return { processed: false, action: 'ignored' };
  }

  // Find matching autopilot PR
  const prData = await findAutopilotPrByNumber(supabase, prNumber, repoFullName);

  if (!prData) {
    return { processed: false, action: 'not_autopilot_pr' };
  }

  const reviewState = review.state as string;
  let newStatus: PRStatus | null = null;

  switch (reviewState) {
    case 'approved':
      newStatus = 'approved';
      break;
    case 'changes_requested':
      newStatus = 'changes_requested';
      break;
  }

  if (newStatus && newStatus !== prData.status) {
    const reviewer = (review.user as Record<string, unknown>)?.login as string;
    const history = [...prData.history, {
      status: newStatus,
      timestamp: new Date().toISOString(),
      actor: reviewer,
      details: `Review: ${reviewState}`,
    }];

    await supabase
      .from('autopilot_prs')
      .update({
        status: newStatus,
        history,
        updated_at: new Date().toISOString(),
      })
      .eq('id', prData.id);

    // Auto-merge if approved and autoMerge enabled
    if (newStatus === 'approved') {
      await attemptAutoMerge(prData, owner, repo, supabase);
    }
  }

  return { processed: true, action: reviewState };
}

/**
 * Handle check_suite event
 */
async function handleCheckSuiteEvent(
  payload: Record<string, unknown>,
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<{ processed: boolean; action?: string; error?: string }> {
  const action = payload.action as string;
  const checkSuite = payload.check_suite as Record<string, unknown>;

  if (action !== 'completed') {
    return { processed: false, action: 'ignored' };
  }

  const conclusion = checkSuite.conclusion as string;

  const prNumbers = extractCheckSuitePRNumbers(checkSuite);
  const headBranch = extractCheckSuiteHeadBranch(checkSuite);
  const repoFullName = `${owner}/${repo}`;

  // Prefer matching by PR number when available (most reliable).
  let prs: AutopilotPrRow[] | null = null;
  if (prNumbers.length > 0) {
    const { data } = await supabase
      .from('autopilot_prs')
      .select('*')
      .in('pr_number', prNumbers);
    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    prs = rows.filter((row) => matchesRepoFullName(row, repoFullName)) as AutopilotPrRow[];
  } else if (headBranch) {
    // Fallback: match by head branch name stored in PR context.
    const { data } = await supabase
      .from('autopilot_prs')
      .select('*')
      .contains('context', { headBranch });
    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    prs = rows.filter((row) => matchesRepoFullName(row, repoFullName)) as AutopilotPrRow[];
  }

  if (!prs || prs.length === 0) {
    return { processed: false, action: 'not_autopilot_pr' };
  }

  for (const prData of prs) {
    if (conclusion === 'success' && prData.status === 'approved') {
      await attemptAutoMerge(prData, owner, repo, supabase);
    }
  }

  return { processed: true, action: conclusion };
}

/**
 * Handle check_run event
 */
async function handleCheckRunEvent(
  payload: Record<string, unknown>,
  _owner: string,
  _repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _supabase: any
): Promise<{ processed: boolean; action?: string; error?: string }> {

  const action = payload.action as string;

  if (action !== 'completed') {
    return { processed: false, action: 'ignored' };
  }

  // Similar to check_suite, but for individual checks
  // This can be used for more granular check tracking

  return { processed: true, action };
}

/**
 * Attempt auto-merge for approved PR
 */
async function attemptAutoMerge(
  prData: AutopilotPrRow,
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<void> {
  // Get user's config
  const { data: configData } = await supabase
    .from('autopilot_configs')
    .select('config, github_token')
    .eq('user_id', prData.user_id)
    .single();

  if (!configData?.github_token) {
    return;
  }

  const config: AutopilotConfig = {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...(configData.config as Partial<AutopilotConfig> || {}),
  };

  if (!config.autoMerge) {
    return;
  }

  try {
    const scopedConfig: AutopilotConfig = { ...config, owner, repo };
    const codeFixer = createCodeFixer(scopedConfig, configData.github_token);
    const result = await codeFixer.mergePR(prData.pr_number);

    if (result.success) {
      const history = [...(Array.isArray(prData.history) ? prData.history : []), {
        status: 'merged',
        timestamp: new Date().toISOString(),
        actor: 'autopilot',
        details: 'Auto-merged after approval',
      }];

      await supabase
        .from('autopilot_prs')
        .update({
          status: 'merged',
          history,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prData.id);
    }
  } catch (error) {
    console.error('Auto-merge failed:', error);
  }
}

/**
 * Clean up after PR merge
 */
async function cleanupAfterMerge(
  prData: AutopilotPrRow,
  owner: string,
  repo: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  headBranchOverride?: string
): Promise<void> {
  // Get user's config
  const { data: configData } = await supabase
    .from('autopilot_configs')
    .select('config, github_token')
    .eq('user_id', prData.user_id)
    .single();

  if (!configData?.github_token) {
    return;
  }

  const config: AutopilotConfig = {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...(configData.config as Partial<AutopilotConfig> || {}),
  };

  try {
    const scopedConfig: AutopilotConfig = { ...config, owner, repo };
    const codeFixer = createCodeFixer(scopedConfig, configData.github_token);
    const headBranch = headBranchOverride || prData.context?.headBranch;
    if (typeof headBranch === 'string' && headBranch) {
      await codeFixer.deleteBranch(headBranch);
    }
  } catch (error) {
    console.error('Branch cleanup failed:', error);
  }
}
