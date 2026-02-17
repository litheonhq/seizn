import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authErrorResponse, isAuthError } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { getTenantPolicy, type TenantPolicy } from '@/lib/tenant-policy';
import { SPRING_MEMORY_TOOLS } from '@/lib/spring/memory-v4';

function buildPolicyEtag(policy: TenantPolicy): string {
  const hash = createHash('sha256')
    .update(JSON.stringify(policy))
    .digest('hex')
    .slice(0, 16);
  return `W/\"tenant-policy-${hash}\"`;
}

/**
 * GET /api/mcp/control-plane
 *
 * Returns a control-plane snapshot that MCP clients can use for:
 * - available tool capabilities
 * - policy delivery state (etag-based)
 * - retrieval/rerank feature flags
 */
export async function GET(request: NextRequest) {
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }

  const { userId, rateLimitHeaders } = authResult;
  const tenantId = new URL(request.url).searchParams.get('tenant_id');

  let policyEtag: string | null = null;

  if (tenantId) {
    const supabase = createServerClient();
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', tenantId)
      .eq('user_id', userId)
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, error: 'Not authorized to access tenant control-plane data' },
        { status: 403 }
      );
    }

    const policy = await getTenantPolicy(tenantId);
    policyEtag = buildPolicyEtag(policy);
  }

  const response = NextResponse.json({
    success: true,
    tenant_id: tenantId,
    mcp: {
      tools_endpoint: '/api/spring/mcp/tools',
      tool_count: Object.keys(SPRING_MEMORY_TOOLS).length,
      capability_groups: ['memory', 'retrieval', 'governance'],
    },
    policy_delivery: {
      endpoint: '/api/tenant-policy?tenant_id={tenant_id}',
      etag: policyEtag,
      supports_conditional_get: true,
      poll_interval_ms: 15000,
    },
    retrieval: {
      hybrid_endpoint: '/api/hybrid/retrieve',
      supports_rerank: true,
      fusion_methods: ['rrf', 'weighted_sum', 'learned', 'cascade'],
    },
    memory_pipeline: {
      flush_endpoint: '/api/memories/flush',
      async_jobs: true,
      cron_endpoint: '/api/cron/spring/jobs/process',
    },
  });

  if (policyEtag) {
    response.headers.set('ETag', policyEtag);
  }

  if (rateLimitHeaders) {
    Object.entries(rateLimitHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  return response;
}
