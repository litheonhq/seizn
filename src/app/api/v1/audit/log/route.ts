/**
 * POST /api/v1/audit/log - Create tamper-evident audit log entry
 *
 * Creates a new tamper-evident audit log entry with hash chain linking.
 *
 * @security Requires audit:write scope or admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { logTamperEvidentEvent } from '@/lib/audit/tamper-evident';
import { validateApiKey } from '@/lib/auth/api-key';
import { getAuditContext } from '@/lib/audit';

interface LogEventRequest {
  action: string;
  resource_type: string;
  resource_id?: string;
  details?: Record<string, unknown>;
  status?: 'success' | 'failed' | 'denied';
  error_message?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    // Check for appropriate scope
    const hasPermission =
      auth.scopes?.includes('admin') ||
      auth.scopes?.includes('audit:write') ||
      auth.scopes?.includes('*');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires admin or audit:write scope' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as LogEventRequest;

    // Validate required fields
    if (!body.action || !body.resource_type) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'action and resource_type are required',
        },
        { status: 400 }
      );
    }

    // Extract request context
    const context = getAuditContext(request);

    // Create tamper-evident entry
    const entry = await logTamperEvidentEvent({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      action: body.action,
      resource_type: body.resource_type,
      resource_id: body.resource_id,
      details: body.details,
      status: body.status || 'success',
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      request_id: context.requestId,
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Failed to create audit entry' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      entry: {
        id: entry.id,
        sequence_number: entry.sequence_number,
        entry_hash: entry.entry_hash,
        prev_hash: entry.prev_hash,
        created_at: entry.created_at,
      },
    });
  } catch (error) {
    console.error('[AuditLog] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
