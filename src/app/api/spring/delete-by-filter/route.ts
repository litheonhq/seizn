/**
 * Delete by Filter API
 *
 * POST /api/spring/delete-by-filter - Bulk delete memories matching filters
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { createServerClient } from '@/lib/supabase';

// =============================================================================
// POST - Delete by Filter
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

    // Require at least one filter to prevent accidental mass deletion
    const filters = body.filters as Record<string, unknown> | undefined;
    if (!filters || Object.keys(filters).length === 0) {
      return ValidationErrors.invalidValue(
        'filters',
        'empty',
        'At least one filter is required to prevent accidental mass deletion'
      );
    }

    // Optional: require confirmation for large deletes
    const confirm = body.confirm as boolean;
    const dryRun = body.dryRun as boolean ?? true; // Default to dry run

    const supabase = createServerClient();

    if (dryRun) {
      // Count how many would be deleted
      let query = supabase
        .from('spring_memory_notes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .is('deleted_at', null);

      if (filters.types && Array.isArray(filters.types)) {
        query = query.in('type', filters.types);
      }

      if (filters.categories && Array.isArray(filters.categories)) {
        query = query.overlaps('categories', filters.categories);
      }

      if (filters.tags && Array.isArray(filters.tags)) {
        query = query.overlaps('tags', filters.tags);
      }

      // Note: 'namespace' filter maps to 'scope' column in spring_memory_notes
      // (v3 schema doesn't have a separate namespace column)
      // See: src/lib/spring/memory-v4/types.ts for DB_COLUMN_MAP
      if (filters.namespace) {
        query = query.eq('scope', filters.namespace);
      }

      if (filters.before) {
        query = query.lt('created_at', filters.before);
      }

      if (filters.after) {
        query = query.gt('created_at', filters.after);
      }

      const { count, error } = await query;

      if (error) {
        throw error;
      }

      await logRequest(
        { userId, keyId, endpoint: '/api/spring/delete-by-filter', method: 'POST', startTime },
        200
      );

      const response = NextResponse.json({
        success: true,
        dryRun: true,
        wouldDelete: count || 0,
        message: `Would delete ${count || 0} memories. Set dryRun: false and confirm: true to execute.`,
      });

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    // Actual deletion
    if (!confirm) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'CONFIRMATION_REQUIRED',
            message: 'Set confirm: true to execute deletion',
          },
        },
        { status: 400 }
      );
    }

    // Use RPC function for deletion
    const { data: deletedCount, error } = await supabase.rpc('delete_spring_memories_by_filter', {
      p_user_id: userId,
      p_filters: filters,
    });

    if (error) {
      // Fallback to manual deletion
      let query = supabase
        .from('spring_memory_notes')
        .update({
          status: 'deleted',
          deleted_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .neq('status', 'deleted')
        .is('deleted_at', null);

      if (filters.types && Array.isArray(filters.types)) {
        query = query.in('type', filters.types);
      }

      if (filters.categories && Array.isArray(filters.categories)) {
        query = query.overlaps('categories', filters.categories);
      }

      if (filters.tags && Array.isArray(filters.tags)) {
        query = query.overlaps('tags', filters.tags);
      }

      // Note: 'namespace' filter maps to 'scope' column in spring_memory_notes
      // (v3 schema doesn't have a separate namespace column)
      // See: src/lib/spring/memory-v4/types.ts for DB_COLUMN_MAP
      if (filters.namespace) {
        query = query.eq('scope', filters.namespace);
      }

      if (filters.before) {
        query = query.lt('created_at', filters.before);
      }

      if (filters.after) {
        query = query.gt('created_at', filters.after);
      }

      const { error: updateError, count } = await query;

      if (updateError) {
        throw updateError;
      }

      await logRequest(
        { userId, keyId, endpoint: '/api/spring/delete-by-filter', method: 'POST', startTime },
        200
      );

      const response = NextResponse.json({
        success: true,
        dryRun: false,
        deleted: count || 0,
      });

      if (rateLimitHeaders) {
        Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
      }

      return response;
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/spring/delete-by-filter', method: 'POST', startTime },
      200
    );

    const response = NextResponse.json({
      success: true,
      dryRun: false,
      deleted: deletedCount || 0,
    });

    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (error) {
    console.error('Delete by filter error:', error);
    return ServerErrors.internal('delete_by_filter');
  }
}
