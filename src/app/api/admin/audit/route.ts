/**
 * Admin Audit Events API
 *
 * GET /api/admin/audit - Query audit events
 * GET /api/admin/audit?summary=true - Get audit summary
 * GET /api/admin/audit?export=csv - Export to CSV
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasPermission } from '@/lib/rbac/permissions';
import { Permissions } from '@/lib/rbac/types';
import { logServerError } from '@/lib/server/logger';
import {
  queryAuditEvents,
  getAuditSummary,
  exportAuditEventsToCSV,
  exportAuditEventsToJSON,
  logAuditEvent,
  type AuditQueryParams,
  type AuditEventCategory,
  type AuditEventSeverity,
} from '@/lib/enterprise-auth/audit';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const orgId = searchParams.get('orgId') || session.user.organizationId;

    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }

    // Verify user has admin access to this org
    const permCheck = await hasPermission(session.user.id, orgId, Permissions.AUDIT_LOG_VIEW);
    if (!permCheck.allowed) {
      return NextResponse.json(
        { error: 'Forbidden: insufficient permissions for audit access' },
        { status: 403 }
      );
    }

    // Check if requesting summary
    if (searchParams.get('summary') === 'true') {
      const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 365);
      const summary = await getAuditSummary(orgId, days);
      return NextResponse.json({ summary });
    }

    // Build query params with bounds checking
    const rawLimit = parseInt(searchParams.get('limit') || '100', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);

    const params: AuditQueryParams = {
      organizationId: orgId,
      category: searchParams.get('category') as AuditEventCategory || undefined,
      eventType: searchParams.get('eventType') || undefined,
      actorId: searchParams.get('actorId') || undefined,
      resourceType: searchParams.get('resourceType') || undefined,
      resourceId: searchParams.get('resourceId') || undefined,
      severity: searchParams.get('severity') as AuditEventSeverity || undefined,
      success: searchParams.has('success')
        ? searchParams.get('success') === 'true'
        : undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      limit: Math.min(Math.max(rawLimit || 100, 1), 1000),
      offset: Math.max(rawOffset || 0, 0),
    };

    const events = await queryAuditEvents(params);

    // Handle export formats
    const exportFormat = searchParams.get('export');
    if (exportFormat === 'csv') {
      const csv = exportAuditEventsToCSV(events);

      // Log the export action
      await logAuditEvent({
        organizationId: orgId,
        actorId: session.user.id,
        eventCategory: 'export',
        eventType: 'audit_log_exported',
        action: 'export audit log',
        metadata: {
          format: 'csv',
          eventCount: events.length,
          filters: params,
        },
      });

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    if (exportFormat === 'json') {
      const json = exportAuditEventsToJSON(events);

      await logAuditEvent({
        organizationId: orgId,
        actorId: session.user.id,
        eventCategory: 'export',
        eventType: 'audit_log_exported',
        action: 'export audit log',
        metadata: {
          format: 'json',
          eventCount: events.length,
          filters: params,
        },
      });

      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="audit-log-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    return NextResponse.json({
      events,
      pagination: {
        limit: params.limit,
        offset: params.offset,
        hasMore: events.length === params.limit,
      },
    });
  } catch (error) {
    logServerError('Audit query error', error);
    return NextResponse.json(
      { error: 'Failed to query audit events' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      eventCategory,
      eventType,
      action,
      resourceType,
      resourceId,
      resourceName,
      success = true,
      errorMessage,
      previousState,
      newState,
      metadata,
    } = body;

    const orgId = organizationId || session.user.organizationId;
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization ID required' },
        { status: 400 }
      );
    }

    // Verify user has admin access to this org
    const permCheck = await hasPermission(session.user.id, orgId, Permissions.AUDIT_LOG_VIEW);
    if (!permCheck.allowed) {
      return NextResponse.json(
        { error: 'Forbidden: insufficient permissions for audit access' },
        { status: 403 }
      );
    }

    if (!eventCategory || !eventType || !action) {
      return NextResponse.json(
        { error: 'eventCategory, eventType, and action are required' },
        { status: 400 }
      );
    }

    // Get request context
    const forwardedFor = request.headers.get('x-forwarded-for');
    const userAgent = request.headers.get('user-agent');

    const eventId = await logAuditEvent({
      organizationId: orgId,
      actorId: session.user.id,
      actorEmail: session.user.email || undefined,
      actorIpAddress: forwardedFor?.split(',')[0].trim(),
      actorUserAgent: userAgent || undefined,
      eventCategory,
      eventType,
      action,
      resourceType,
      resourceId,
      resourceName,
      success,
      errorMessage,
      previousState,
      newState,
      source: 'api',
      metadata,
    });

    return NextResponse.json({ id: eventId, success: true });
  } catch (error) {
    logServerError('Audit log error', error);
    return NextResponse.json(
      { error: 'Failed to log audit event' },
      { status: 500 }
    );
  }
}

