/**
 * Spring MCP Tools API
 *
 * POST /api/spring/mcp/tools - Execute an MCP tool
 * GET /api/spring/mcp/tools - List available tools
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { enforceQuota, recordUsage } from '@/lib/api-keys';
import { QuotaExceededError } from '@/lib/api-keys/errors';
import { createServerClient } from '@/lib/supabase';
import {
  SPRING_MEMORY_TOOLS,
  executeSpringMemoryTool,
  type SpringMemoryToolContext,
} from '@/lib/spring/memory-v4';

/**
 * Resolve Track 2 quota fields for a given api_key. Returns null when the
 * key isn't a Track 2 key (no monthly_quota row) so the caller can skip
 * Track 2 enforcement gracefully.
 *
 * Audit: pre-fix the Spring MCP route only ran the Track 1 monthly check
 * (via authenticateRequest's checkUsageLimits), so Free Track 2 users
 * could spam the MCP daily quota (50/day) without enforcement. Track 2
 * needs its own per-key quota gate via enforceQuota.
 */
async function loadTrack2QuotaForKey(keyId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('api_keys')
    .select('monthly_quota, monthly_quota_period')
    .eq('id', keyId)
    .single<{ monthly_quota: number | null; monthly_quota_period: 'day' | 'month' | null }>();
  if (!data || data.monthly_quota == null || !data.monthly_quota_period) return null;
  return { quota: data.monthly_quota, period: data.monthly_quota_period };
}

// =============================================================================
// GET - List Available Tools
// =============================================================================

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/mcp/tools', method: 'GET', startTime },
      200
    );

    const tools = Object.values(SPRING_MEMORY_TOOLS).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const response = NextResponse.json({
      success: true,
      tools,
      count: tools.length,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('List MCP tools error:', error);
    return ServerErrors.internal('list_mcp_tools');
  }
}

// =============================================================================
// POST - Execute Tool
// =============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Track 2 daily-quota gate. v9 Free is 50/day; without this every
    // Free user could spam the MCP tools without hitting their per-key
    // cap (Track 1 monthly cap doesn't constrain MCP usage).
    const track2Quota = await loadTrack2QuotaForKey(keyId);
    if (track2Quota) {
      try {
        await enforceQuota(keyId, track2Quota.quota, track2Quota.period, { userId });
      } catch (quotaError) {
        if (quotaError instanceof QuotaExceededError) {
          return NextResponse.json(
            {
              success: false,
              error: {
                code: 'QUOTA_EXCEEDED',
                message: `Track 2 ${track2Quota.period} quota exceeded (${track2Quota.quota}). Upgrade to a higher tier or wait for the period to reset.`,
              },
            },
            { status: 429 },
          );
        }
        throw quotaError;
      }
    }

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON');
    }

    // Validate tool name
    const toolName = body.tool as string;
    if (!toolName) {
      return ValidationErrors.missingField('tool');
    }

    const validTools = Object.keys(SPRING_MEMORY_TOOLS);
    if (!validTools.includes(toolName)) {
      return ValidationErrors.invalidValue('tool', toolName, validTools.join(', '));
    }

    // Get arguments
    const args = (body.arguments as Record<string, unknown>) || {};

    // Build context
    const context: SpringMemoryToolContext = {
      userId,
      organizationId: body.organization_id as string | undefined,
      workspaceId: body.workspace_id as string | undefined,
      namespace: body.namespace as string | undefined,
      agentId: body.agent_id as string | undefined,
      sessionId: body.session_id as string | undefined,
      source: 'mcp_api',
    };

    // Execute tool
    const result = await executeSpringMemoryTool(toolName, args, context);

    // Track 2 usage counter. Increments per-key day/month buckets in Redis +
    // api_key_usage table. Only credit successful calls.
    if (result.success && track2Quota) {
      try {
        await recordUsage({ apiKeyId: keyId, tool: toolName as Parameters<typeof recordUsage>[0]['tool'] });
      } catch (usageErr) {
        console.error('[mcp tools] Track 2 recordUsage failed', usageErr);
      }
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/mcp/tools', method: 'POST', startTime },
      result.success ? 200 : 400
    );

    if (!result.success) {
      const response = NextResponse.json(
        {
          success: false,
          error: {
            code: 'TOOL_EXECUTION_ERROR',
            message: result.error,
          },
        },
        { status: 400 }
      );

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    const response = NextResponse.json({
      success: true,
      tool: toolName,
      result: result.result,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Execute MCP tool error:', error);
    return ServerErrors.internal('execute_mcp_tool');
  }
}
