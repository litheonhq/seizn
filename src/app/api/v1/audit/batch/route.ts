/**
 * POST /api/v1/audit/batch - Create Merkle batch for audit logs
 *
 * Creates a Merkle tree batch for a range of tamper-evident audit entries.
 * Should be called periodically (e.g., hourly) via cron job.
 *
 * @security Requires admin or audit:write scope
 */

import { NextRequest, NextResponse } from 'next/server';
import { createMerkleBatch, logTamperEvidentEvent } from '@/lib/audit/tamper-evident';
import { validateApiKey } from '@/lib/auth/api-key';
import { getAuditContext } from '@/lib/audit';
import { createServerClient } from '@/lib/supabase';

interface CreateBatchRequest {
  organization_id: string;
  max_entries?: number;
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

    // Check for admin scope
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

    const body = (await request.json()) as CreateBatchRequest;

    if (!body.organization_id) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'organization_id is required' },
        { status: 400 }
      );
    }

    // Ensure user can only create batches for their own organization
    if (body.organization_id !== auth.organizationId && !auth.scopes?.includes('admin')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot create batches for other organizations' },
        { status: 403 }
      );
    }

    const batch = await createMerkleBatch(body.organization_id, {
      maxEntries: body.max_entries || 10000,
    });

    if (!batch) {
      return NextResponse.json({
        success: false,
        message: 'No unbatched entries found or batch creation failed',
      });
    }

    // Log the batch creation
    const context = getAuditContext(request);
    await logTamperEvidentEvent({
      organization_id: auth.organizationId,
      user_id: auth.userId,
      action: 'audit.batch_create',
      resource_type: 'merkle_batch',
      resource_id: batch.id,
      details: {
        entry_count: batch.entry_count,
        first_sequence: batch.first_sequence,
        last_sequence: batch.last_sequence,
        merkle_root: batch.merkle_root,
      },
      status: 'success',
      ip_address: context.ipAddress,
      user_agent: context.userAgent,
      request_id: context.requestId,
    });

    return NextResponse.json({
      success: true,
      batch: {
        id: batch.id,
        merkle_root: batch.merkle_root,
        entry_count: batch.entry_count,
        first_sequence: batch.first_sequence,
        last_sequence: batch.last_sequence,
        created_at: batch.created_at,
      },
    });
  } catch (error) {
    console.error('[AuditBatch] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/audit/batch - List Merkle batches
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id') || auth.organizationId;
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Ensure user can only list their own organization's batches
    if (organizationId !== auth.organizationId && !auth.scopes?.includes('admin')) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Cannot list batches for other organizations' },
        { status: 403 }
      );
    }

    const supabase = createServerClient();

    const { data: batches, error, count } = await supabase
      .from('audit_merkle_batches')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      batches: batches || [],
      total: count || 0,
      limit,
      offset,
      has_more: (count || 0) > offset + limit,
    });
  } catch (error) {
    console.error('[AuditBatch] Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
