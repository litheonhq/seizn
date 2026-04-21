import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createReplayBundle, type ReplayBundleResult } from '@/lib/replay-bundler';
import { resolveReplayOrganizationId } from '@/lib/replay/snapshot';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

type BugTrackerProvider = 'linear' | 'github' | 'jira';

interface BugTrackerPayload {
  integration_id?: string;
  studio_id?: string;
  organization_id?: string;
  memory_session_id?: string;
  memorySessionId?: string;
  trace_id?: string;
  traceId?: string;
  issueId?: string;
  issue_id?: string;
  issueKey?: string;
  issue_key?: string;
  issueNumber?: number | string;
  issue_number?: number | string;
  owner?: string;
  repo?: string;
  repository?: { full_name?: string; name?: string; owner?: { login?: string } };
  issue?: {
    id?: string;
    key?: string;
    number?: number;
    body?: string;
    description?: string;
  };
  data?: {
    id?: string;
    identifier?: string;
    description?: string;
  };
  body?: string;
  description?: string;
}

interface IntegrationRow {
  id: string;
  studio_id: string;
  organization_id: string | null;
  provider: BugTrackerProvider;
  encrypted_token: string;
  webhook_secret_hash: string | null;
  default_project_key: string | null;
  base_url: string | null;
  settings: Record<string, unknown> | null;
}

function isProvider(value: string): value is BugTrackerProvider {
  return value === 'linear' || value === 'github' || value === 'jira';
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function decryptIntegrationToken(encryptedToken: string): string {
  if (!encryptedToken.startsWith('enc:v1:')) {
    return encryptedToken;
  }

  const keyMaterial = process.env.BUG_TRACKER_TOKEN_ENCRYPTION_KEY;
  if (!keyMaterial) {
    throw new Error('BUG_TRACKER_TOKEN_ENCRYPTION_KEY is required for encrypted bug tracker tokens');
  }

  const [, , ivB64, tagB64, cipherB64] = encryptedToken.split(':');
  if (!ivB64 || !tagB64 || !cipherB64) {
    throw new Error('Invalid encrypted bug tracker token format');
  }

  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(cipherB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function extractTraceId(payload: BugTrackerPayload): string | null {
  const direct =
    payload.memory_session_id ||
    payload.memorySessionId ||
    payload.trace_id ||
    payload.traceId;
  if (direct) return String(direct);

  const text = [payload.body, payload.description, payload.issue?.body, payload.issue?.description, payload.data?.description]
    .filter(Boolean)
    .join('\n');
  const match = text.match(/(?:memory_session_id|memorySessionId|trace_id|traceId)\s*[:=]\s*([0-9a-f-]{20,})/i);
  return match?.[1] || null;
}

function resolveGitHubTarget(payload: BugTrackerPayload): { owner: string; repo: string; issueNumber: number } {
  const fullName = payload.repository?.full_name;
  const [ownerFromFullName, repoFromFullName] = fullName ? fullName.split('/') : [];
  const owner = payload.owner || payload.repository?.owner?.login || ownerFromFullName;
  const repo = payload.repo || payload.repository?.name || repoFromFullName;
  const issueNumber = Number(payload.issueNumber || payload.issue_number || payload.issue?.number);

  if (!owner || !repo || !Number.isFinite(issueNumber) || issueNumber <= 0) {
    throw new Error('GitHub owner, repo, and issue number are required');
  }

  return { owner, repo, issueNumber };
}

function resolveExternalIssueKey(provider: BugTrackerProvider, payload: BugTrackerPayload): string {
  if (provider === 'linear') {
    const issueId = payload.issueId || payload.issue_id || payload.issue?.id || payload.data?.id;
    if (!issueId) throw new Error('Linear issue id is required');
    return issueId;
  }

  if (provider === 'github') {
    const target = resolveGitHubTarget(payload);
    return `${target.owner}/${target.repo}#${target.issueNumber}`;
  }

  const issueKey = payload.issueKey || payload.issue_key || payload.issue?.key;
  if (!issueKey) throw new Error('Jira issue key is required');
  return issueKey;
}

function buildReplayBlock(bundle: ReplayBundleResult): string {
  const npcList = bundle.npcsAffected.length > 0 ? bundle.npcsAffected.join(', ') : 'none detected';
  return [
    '## Seizn Replay',
    `- Session: ${bundle.traceId}`,
    `- Bundle: ${bundle.bundleUrl} (expires ${bundle.expiresAt})`,
    `- Replay hash: ${bundle.replayHash}`,
    `- NPCs affected: ${npcList}`,
    `- Canon violations: ${bundle.canonViolationCount}`,
  ].join('\n');
}

function appendBlock(existing: string | null | undefined, block: string): string {
  const current = existing?.trim();
  return current ? `${current}\n\n${block}` : block;
}

async function bugTrackerJsonFetch(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof (payload as { error?: { message?: string } })?.error?.message === 'string'
        ? (payload as { error: { message: string } }).error.message
        : `Bug tracker request failed with ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function appendToLinear(issueId: string, token: string, block: string) {
  const endpoint = 'https://api.linear.app/graphql';
  const query = await bugTrackerJsonFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'query Issue($id: String!) { issue(id: $id) { id description } }',
      variables: { id: issueId },
    }),
  }) as { data?: { issue?: { description?: string | null } }; errors?: Array<{ message?: string }> };

  if (query.errors?.length) {
    throw new Error(query.errors[0]?.message || 'Linear issue lookup failed');
  }

  const description = appendBlock(query.data?.issue?.description, block);
  const mutation = await bugTrackerJsonFetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }',
      variables: { id: issueId, input: { description } },
    }),
  }) as { data?: { issueUpdate?: { success?: boolean } }; errors?: Array<{ message?: string }> };

  if (mutation.errors?.length || mutation.data?.issueUpdate?.success !== true) {
    throw new Error(mutation.errors?.[0]?.message || 'Linear issue update failed');
  }
}

async function appendToGitHub(payload: BugTrackerPayload, token: string, block: string) {
  const target = resolveGitHubTarget(payload);
  const base = `https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/issues/${target.issueNumber}`;
  const issue = await bugTrackerJsonFetch(base, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }) as { body?: string | null };

  await bugTrackerJsonFetch(base, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body: appendBlock(issue.body, block) }),
  });
}

async function appendToJira(issueKey: string, integration: IntegrationRow, token: string, block: string) {
  const baseUrl = integration.base_url || (typeof integration.settings?.base_url === 'string' ? integration.settings.base_url : null);
  if (!baseUrl) {
    throw new Error('Jira base_url is required in the integration');
  }

  const base = `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueKey)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const issue = await bugTrackerJsonFetch(`${base}?fields=description`, {
    headers,
  }) as { fields?: { description?: unknown } };

  await bugTrackerJsonFetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      fields: {
        description: appendJiraDescription(issue.fields?.description, block),
      },
    }),
  });
}

function isJiraDoc(value: unknown): value is { type: 'doc'; version: number; content: unknown[] } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { type?: unknown }).type === 'doc' &&
      Array.isArray((value as { content?: unknown }).content)
  );
}

function replayBlockToJiraNodes(block: string): Array<Record<string, unknown>> {
  return block.split('\n').map((line) => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }));
}

function appendJiraDescription(description: unknown, block: string): Record<string, unknown> {
  const appended = replayBlockToJiraNodes(block);
  if (isJiraDoc(description)) {
    return {
      ...description,
      content: [
        ...description.content,
        { type: 'paragraph', content: [] },
        ...appended,
      ],
    };
  }

  return {
    type: 'doc',
    version: 1,
    content: appended,
  };
}

async function appendToProvider(
  provider: BugTrackerProvider,
  integration: IntegrationRow,
  payload: BugTrackerPayload,
  token: string,
  block: string
) {
  if (provider === 'linear') {
    await appendToLinear(resolveExternalIssueKey(provider, payload), token, block);
    return;
  }
  if (provider === 'github') {
    await appendToGitHub(payload, token, block);
    return;
  }
  await appendToJira(resolveExternalIssueKey(provider, payload), integration, token, block);
}

async function loadIntegration(
  provider: BugTrackerProvider,
  payload: BugTrackerPayload,
  sessionOrganizationId: string | null
): Promise<IntegrationRow | null> {
  const supabase = createServerClient();
  let query = supabase
    .from('bug_tracker_integrations')
    .select('id, studio_id, organization_id, provider, encrypted_token, webhook_secret_hash, default_project_key, base_url, settings')
    .eq('provider', provider)
    .eq('active', true)
    .limit(1);

  if (payload.integration_id) {
    query = query.eq('id', payload.integration_id);
  } else if (sessionOrganizationId) {
    query = query.eq('organization_id', sessionOrganizationId);
  } else if (payload.organization_id) {
    query = query.eq('organization_id', payload.organization_id);
  } else if (payload.studio_id) {
    query = query.eq('studio_id', payload.studio_id);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    logServerWarn('Bug tracker integration lookup failed', error, { provider });
    return null;
  }
  return data as IntegrationRow | null;
}

function assertWebhookSecret(request: NextRequest, integration: IntegrationRow | null): boolean {
  const supplied = request.headers.get('x-seizn-webhook-secret') || '';
  if (integration?.webhook_secret_hash) {
    return timingSafeEqualString(sha256(supplied), integration.webhook_secret_hash);
  }

  const globalSecret = process.env.BUG_TRACKER_WEBHOOK_SECRET;
  if (globalSecret) {
    return timingSafeEqualString(supplied, globalSecret);
  }

  return false;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await params;
  const provider = rawProvider.toLowerCase();
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Unsupported bug tracker provider' }, { status: 400 });
  }

  try {
    const payload = (await request.json().catch(() => ({}))) as BugTrackerPayload;
    const session = await auth().catch(() => null);
    const sessionOrganizationId = session?.user?.id
      ? await resolveReplayOrganizationId(session.user.id, null)
      : null;
    const integration = await loadIntegration(provider, payload, sessionOrganizationId);

    if (!integration) {
      return NextResponse.json({ error: 'Bug tracker integration not found' }, { status: 404 });
    }
    if (!session?.user?.id && !assertWebhookSecret(request, integration)) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }

    const traceId = extractTraceId(payload);
    if (!traceId) {
      return NextResponse.json({ error: 'memory_session_id or traceId is required' }, { status: 400 });
    }

    const organizationId =
      sessionOrganizationId ||
      integration.organization_id ||
      (isUuid(payload.organization_id) ? payload.organization_id : null) ||
      (isUuid(payload.studio_id) ? payload.studio_id : null);
    if (!organizationId) {
      return NextResponse.json({ error: 'Replay organization_id is required' }, { status: 400 });
    }

    const externalIssueKey = resolveExternalIssueKey(provider, payload);
    const bundle = await createReplayBundle({
      traceId,
      organizationId,
      provider,
      externalIssueKey,
      createdBy: session?.user?.id || null,
    });
    const replayBlock = buildReplayBlock(bundle);
    const token = decryptIntegrationToken(integration.encrypted_token);

    await appendToProvider(provider, integration, payload, token, replayBlock);

    return NextResponse.json({
      success: true,
      provider,
      externalIssueKey,
      replayBlock,
      bundle,
    });
  } catch (error) {
    logServerError('Bug tracker replay webhook failed', error, { provider });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to attach replay bundle' },
      { status: 500 }
    );
  }
}
