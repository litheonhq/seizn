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
import {
  SPRING_MEMORY_TOOLS,
  executeSpringMemoryTool,
  type SpringMemoryToolContext,
} from '@/lib/spring/memory-v4';

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
