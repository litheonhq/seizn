import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';

interface ExportedMemory {
  id: string;
  content: string;
  memory_type: string;
  tags: string[];
  namespace: string;
  importance: number;
  source: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/memories/export - Export all memories
// Supports: format=json (default), format=csv
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const format = searchParams.get('format') || 'json'; // json, csv
    const namespace = searchParams.get('namespace'); // Optional filter
    const memory_type = searchParams.get('memory_type'); // Optional filter
    const limit = parseInt(searchParams.get('limit') || '10000'); // Max 10000 per export
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!['json', 'csv'].includes(format)) {
      return NextResponse.json(
        { error: 'Invalid format. Use json or csv' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();


    const { data: memories, error } = await supabase
      .from('memories')
      .select('id, content, memory_type, tags, namespace, importance, source, created_at, updated_at', { count: 'exact' })
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
      .then(async (res) => {
        // Apply filters manually since chaining doesn't work well
        if (res.error) return res;
        let filtered = res.data;
        if (namespace) {
          filtered = filtered?.filter(m => m.namespace === namespace);
        }
        if (memory_type) {
          filtered = filtered?.filter(m => m.memory_type === memory_type);
        }
        return { ...res, data: filtered };
      });

    if (error) {
      console.error('Export error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/memories/export', method: 'GET', startTime },
        500
      );
      return NextResponse.json(
        { error: 'Failed to export memories' },
        { status: 500 }
      );
    }

    // Log successful request
    await logRequest(
      { userId, keyId, endpoint: '/api/memories/export', method: 'GET', startTime },
      200
    );

    // Get total count for pagination info
    const { count: totalCount } = await supabase
      .from('memories')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_deleted', false);

    if (format === 'csv') {
      // Convert to CSV
      const csv = convertToCSV(memories as ExportedMemory[]);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="seizn-memories-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // Return JSON
    return NextResponse.json({
      success: true,
      export: {
        format: 'json',
        exported_at: new Date().toISOString(),
        count: memories?.length || 0,
        total_count: totalCount || 0,
        offset,
        limit,
        has_more: (offset + limit) < (totalCount || 0),
      },
      memories: memories || [],
    });
  } catch (error) {
    console.error('Export memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function convertToCSV(memories: ExportedMemory[]): string {
  if (!memories || memories.length === 0) {
    return 'id,content,memory_type,tags,namespace,importance,source,created_at,updated_at\n';
  }

  const headers = ['id', 'content', 'memory_type', 'tags', 'namespace', 'importance', 'source', 'created_at', 'updated_at'];
  const csvRows = [headers.join(',')];

  for (const memory of memories) {
    const row = [
      escapeCSV(memory.id),
      escapeCSV(memory.content),
      escapeCSV(memory.memory_type),
      escapeCSV(memory.tags?.join(';') || ''),
      escapeCSV(memory.namespace),
      String(memory.importance),
      escapeCSV(memory.source || ''),
      escapeCSV(memory.created_at),
      escapeCSV(memory.updated_at),
    ];
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

function escapeCSV(value: string): string {
  if (!value) return '';
  // If value contains comma, newline, or quote, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
