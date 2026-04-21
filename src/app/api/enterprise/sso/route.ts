import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { ServerErrors } from '@/lib/api-error';
import { SSOService } from '@/lib/enterprise';
import { getRequestUser } from '@/lib/api/request-user';
import { verifyCsrf } from '@/lib/csrf';
import { createServerClient } from '@/lib/supabase';
import { logServerError } from '@/lib/server/logger';
import { hasFeature } from '@/lib/plan-limits';
import {
  getSSOConnections,
  createSSOConnection,
  updateSSOConnection,
} from '@/lib/sso';
import type {
  SSOConnectionStatus,
  SSOProviderType,
} from '@/types/sso';

async function resolveAdminOrgId(userId: string, requestedOrgId?: string | null): Promise<string | null> {
  const supabase = createServerClient();

  if (requestedOrgId) {
    const { data } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('organization_id', requestedOrgId)
      .eq('user_id', userId)
      .single();

    if (!data || !['owner', 'admin'].includes(data.role)) return null;
    return data.organization_id;
  }

  // Default: first org where user is owner/admin.
  const { data } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .in('role', ['owner', 'admin'])
    .order('created_at', { ascending: true })
    .limit(1);

  const membership = Array.isArray(data) ? data[0] : null;
  return membership?.organization_id || null;
}

async function getOrganizationPlan(organizationId: string): Promise<string> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', organizationId)
    .maybeSingle();

  return typeof data?.plan === 'string' && data.plan.trim() ? data.plan : 'free';
}

interface EnterpriseSSORequestBody {
  organizationId?: unknown;
  orgId?: unknown;
  connectionId?: unknown;
  provider?: unknown;
  providerType?: unknown;
  domains?: unknown;
  emailDomains?: unknown;
  defaultRole?: unknown;
  enabled?: unknown;
}

const MAX_SSO_DOMAINS = 20;
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

function parseDomains(input: unknown): {
  domains?: string[];
  invalidDomains: string[];
} {
  const rawDomains: string[] = [];

  if (Array.isArray(input)) {
    rawDomains.push(
      ...input
        .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
        .filter(Boolean)
    );
  }

  if (typeof input === 'string') {
    rawDomains.push(
      ...input
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    );
  }

  if (rawDomains.length === 0) {
    return {
      domains: undefined,
      invalidDomains: [],
    };
  }

  const unique = Array.from(new Set(rawDomains)).slice(0, MAX_SSO_DOMAINS);
  const validDomains: string[] = [];
  const invalidDomains: string[] = [];

  for (const domain of unique) {
    if (DOMAIN_PATTERN.test(domain)) {
      validDomains.push(domain);
    } else {
      invalidDomains.push(domain);
    }
  }

  return {
    domains: validDomains.length > 0 ? validDomains : undefined,
    invalidDomains,
  };
}

function normalizeDefaultRole(input: unknown): 'member' | 'admin' | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  const value = input.trim().toLowerCase();
  if (value === 'member' || value === 'admin') {
    return value;
  }
  return undefined;
}

function toConfigShape(connection: {
  id: string;
  status: SSOConnectionStatus;
  name: string;
  emailDomains?: string[];
  settings?: { defaultRole?: string };
}) {
  return {
    id: connection.id,
    enabled: connection.status === 'active',
    provider: connection.name,
    domains: connection.emailDomains || [],
    defaultRole: connection.settings?.defaultRole || 'member',
  };
}

/**
 * GET /api/enterprise/sso - Get SSO configuration or providers
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const info = searchParams.get('info');
    const requestedOrgId = searchParams.get('organization_id') || searchParams.get('org_id');

    if (info === 'providers') {
      return NextResponse.json({
        success: true,
        providers: SSOService.getSupportedProviders(),
      });
    }

    const sessionUser = await getRequestUser(request);
    const apiKeyAuth = sessionUser ? null : await validateApiKey(request);

    const userId = sessionUser?.id || apiKeyAuth?.userId || null;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = await resolveAdminOrgId(
      userId,
      requestedOrgId || apiKeyAuth?.orgId || null
    );

    if (!orgId) {
      // No admin org found; enterprise UI can render "not configured".
      return NextResponse.json({ success: true, config: null });
    }

    // Fetch SSO connections (real implementation)
    const connections = await getSSOConnections(orgId);
    const primary = connections.find((c) => c.status === 'active') || connections[0] || null;

    return NextResponse.json({
      success: true,
      config: primary
        ? {
            id: primary.id,
            enabled: primary.status === 'active',
            provider: primary.name,
            domains: primary.emailDomains || [],
            defaultRole: primary.settings?.defaultRole || 'member',
          }
        : null,
    });
  } catch (error) {
    logServerError('Enterprise SSO GET failed', error);
    return ServerErrors.internal('sso_config');
  }
}

/**
 * POST /api/enterprise/sso - Create or update SSO configuration
 */
export async function POST(_request: NextRequest) {
  try {
    const csrfError = verifyCsrf(_request);
    if (csrfError) {
      return csrfError;
    }

    const sessionUser = await getRequestUser(_request);
    if (!sessionUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(_request.url);
    const body = (await _request.json().catch(() => ({}))) as EnterpriseSSORequestBody;

    const requestedOrgId =
      (typeof body.organizationId === 'string' ? body.organizationId : null) ||
      (typeof body.orgId === 'string' ? body.orgId : null) ||
      url.searchParams.get('organization_id') ||
      url.searchParams.get('org_id');

    const orgId = await resolveAdminOrgId(sessionUser.id, requestedOrgId);
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization not found or insufficient permissions' },
        { status: 403 }
      );
    }

    const orgPlan = await getOrganizationPlan(orgId);
    if (!hasFeature(orgPlan, 'sso')) {
      return NextResponse.json(
        { error: 'SSO requires Pro or Enterprise plan' },
        { status: 403 }
      );
    }

    const providerName =
      typeof body.provider === 'string' && body.provider.trim().length > 0
        ? body.provider.trim()
        : 'Custom SAML 2.0';

    const providerType = (
      typeof body.providerType === 'string' && body.providerType.toLowerCase() === 'oidc'
        ? 'oidc'
        : 'saml'
    ) as SSOProviderType;

    const status =
      typeof body.enabled === 'boolean'
        ? ((body.enabled ? 'active' : 'disabled') as SSOConnectionStatus)
        : undefined;

    const { domains, invalidDomains } = parseDomains(body.domains ?? body.emailDomains);
    if (invalidDomains.length > 0) {
      return NextResponse.json(
        { error: `Invalid domain(s): ${invalidDomains.join(', ')}` },
        { status: 400 }
      );
    }
    const defaultRole = normalizeDefaultRole(body.defaultRole);

    const connections = await getSSOConnections(orgId);
    const requestedConnectionId =
      typeof body.connectionId === 'string' && body.connectionId.trim().length > 0
        ? body.connectionId.trim()
        : undefined;

    const targetConnection = requestedConnectionId
      ? connections.find((connection) => connection.id === requestedConnectionId)
      : connections[0];

    if (requestedConnectionId && !targetConnection) {
      return NextResponse.json({ error: 'SSO connection not found' }, { status: 404 });
    }

    let connection = targetConnection;

    if (!connection) {
      connection = await createSSOConnection(orgId, providerName, providerType, sessionUser.id);
    }

    const updatedConnection = await updateSSOConnection(connection.id, orgId, {
      name: providerName,
      status: status ?? (connections.length === 0 ? 'active' : undefined),
      emailDomains: domains,
      settings: defaultRole ? { defaultRole } : undefined,
    });

    return NextResponse.json({
      success: true,
      config: toConfigShape(updatedConnection),
    });
  } catch (error) {
    logServerError('Enterprise SSO POST failed', error);
    return ServerErrors.internal('sso_config_create');
  }
}

/**
 * DELETE /api/enterprise/sso - Disable SSO
 */
export async function DELETE(_request: NextRequest) {
  try {
    const csrfError = verifyCsrf(_request);
    if (csrfError) {
      return csrfError;
    }

    const sessionUser = await getRequestUser(_request);
    if (!sessionUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(_request.url);
    const body = (await _request.json().catch(() => ({}))) as EnterpriseSSORequestBody;

    const requestedOrgId =
      (typeof body.organizationId === 'string' ? body.organizationId : null) ||
      (typeof body.orgId === 'string' ? body.orgId : null) ||
      url.searchParams.get('organization_id') ||
      url.searchParams.get('org_id');

    const orgId = await resolveAdminOrgId(sessionUser.id, requestedOrgId);
    if (!orgId) {
      return NextResponse.json(
        { error: 'Organization not found or insufficient permissions' },
        { status: 403 }
      );
    }

    const connections = await getSSOConnections(orgId);
    const requestedConnectionId =
      typeof body.connectionId === 'string' && body.connectionId.trim().length > 0
        ? body.connectionId.trim()
        : undefined;

    const targetConnection = requestedConnectionId
      ? connections.find((connection) => connection.id === requestedConnectionId)
      : connections.find((connection) => connection.status === 'active') || connections[0];

    if (!targetConnection) {
      return NextResponse.json({
        success: true,
        config: null,
      });
    }

    const disabledConnection = await updateSSOConnection(targetConnection.id, orgId, {
      status: 'disabled',
    });

    return NextResponse.json({
      success: true,
      config: toConfigShape(disabledConnection),
    });
  } catch (error) {
    logServerError('Enterprise SSO DELETE failed', error);
    return ServerErrors.internal('sso_disable');
  }
}
