/**
 * SAML Assertion Consumer Service (ACS) Endpoint
 *
 * POST /api/sso/saml/[orgSlug]/acs
 * GET  /api/sso/saml/[orgSlug]/acs (best-effort fallback for IdP-initiated flows)
 *
 * This endpoint receives the SAML Response from the IdP, validates it, provisions
 * (or updates) a profile, and establishes an Auth.js (NextAuth v5) session cookie.
 *
 * Security notes:
 * - SP-initiated flows validate InResponseTo against `sso_login_attempts` (replay protection).
 * - RelayState is NOT trusted. We prefer the relay_state stored on the login attempt.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import { getSSOConnection, getSSOConnections } from '@/lib/sso';
import { extractUserAttributes, parseSAMLResponse } from '@/lib/sso/saml-provider';
import { sanitizeRelativeRedirect, sanitizeSameOriginRedirect } from '@/lib/security/redirect';
import { createAuthJsSessionToken } from '@/lib/auth/session-token';

interface RouteParams {
  params: Promise<{ orgSlug: string }>;
}

type LoginAttemptLookup = {
  connection_id: string | null;
  relay_state: string | null;
  response_status: string | null;
};

function getBaseUrl(request: NextRequest): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
}

function getCookieDomain(baseUrl: string): string | undefined {
  if (process.env.AUTH_COOKIE_DOMAIN) {
    return process.env.AUTH_COOKIE_DOMAIN;
  }

  try {
    const hostname = new URL(baseUrl).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined;
    return hostname.startsWith('.') ? hostname : `.${hostname}`;
  } catch {
    return undefined;
  }
}

function extractInResponseToFromSamlResponse(samlResponse: string): string | null {
  if (!samlResponse) return null;

  try {
    const xml = Buffer.from(samlResponse, 'base64').toString('utf-8');
    const m = xml.match(/\bInResponseTo\s*=\s*["']([^"']+)["']/i);
    const value = m?.[1]?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

async function resolveConnectionForAcs(
  supabase: ReturnType<typeof createServerClient>,
  orgId: string,
  inResponseTo: string | null
): Promise<{
  connectionId: string | null;
  relayState: string | null;
}> {
  if (!inResponseTo) {
    return { connectionId: null, relayState: null };
  }

  const { data, error } = await supabase
    .from('sso_login_attempts')
    .select('connection_id, relay_state, response_status')
    .eq('organization_id', orgId)
    .eq('request_id', inResponseTo)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    return { connectionId: null, relayState: null };
  }

  const row = data[0] as LoginAttemptLookup;
  return {
    connectionId: typeof row.connection_id === 'string' ? row.connection_id : null,
    relayState: typeof row.relay_state === 'string' ? row.relay_state : null,
  };
}

async function handleAcs(
  request: NextRequest,
  orgSlug: string,
  samlResponse: string,
  relayStateFromIdp: string | null
) {
  const supabase = createServerClient();
  const baseUrl = getBaseUrl(request);

  // Get organization by slug
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, default_sso_connection_id')
    .eq('slug', orgSlug)
    .single();

  if (orgError || !org) {
    return NextResponse.redirect(new URL('/login?error=org_not_found', baseUrl));
  }

  const inResponseTo = extractInResponseToFromSamlResponse(samlResponse);
  const attemptResolution = await resolveConnectionForAcs(supabase, org.id, inResponseTo);

  const preferredRedirect =
    typeof attemptResolution.relayState === 'string' && attemptResolution.relayState
      ? sanitizeRelativeRedirect(attemptResolution.relayState)
      : null;
  const fallbackRedirect = sanitizeSameOriginRedirect(
    relayStateFromIdp,
    request.nextUrl.origin
  );
  const redirectPath = preferredRedirect || fallbackRedirect || '/dashboard';

  // Prefer the connection recorded on the login attempt (SP-initiated).
  let connection = attemptResolution.connectionId
    ? await getSSOConnection(attemptResolution.connectionId, org.id)
    : null;

  if (!connection) {
    // Fallback: pick a single active/testing SAML connection.
    const connections = await getSSOConnections(org.id);
    const activeSaml = connections.filter(
      (c) => c.providerType === 'saml' && (c.status === 'active' || c.status === 'testing')
    );

    const defaultId = org.default_sso_connection_id as string | null;
    connection = defaultId ? activeSaml.find((c) => c.id === defaultId) || null : null;
    connection ||= activeSaml.length === 1 ? activeSaml[0] : null;
  }

  if (!connection) {
    return NextResponse.redirect(new URL('/login?error=sso_not_configured', baseUrl));
  }

  // Validate response
  const validation = await parseSAMLResponse(samlResponse, connection);
  if ('error' in validation) {
    console.error('SAML validation failed:', validation.error);

    // Best-effort audit trail: update the attempt if we can, otherwise insert a new row.
    try {
      if (inResponseTo) {
        await supabase
          .from('sso_login_attempts')
          .update({
            response_status: 'error',
            error_code: validation.error.code,
            error_message: validation.error.message,
            ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            user_agent: request.headers.get('user-agent'),
          })
          .eq('organization_id', org.id)
          .eq('request_id', inResponseTo);
      } else {
        await supabase.from('sso_login_attempts').insert({
          connection_id: connection.id,
          organization_id: org.id,
          response_status: 'error',
          error_code: validation.error.code,
          error_message: validation.error.message,
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent'),
        });
      }
    } catch {
      // ignore logging errors
    }

    const errorUrl = new URL('/login', baseUrl);
    errorUrl.searchParams.set('error', 'saml_validation_failed');
    errorUrl.searchParams.set('error_description', validation.error.message);
    return NextResponse.redirect(errorUrl);
  }

  const { profile } = validation;

  let userId: string | null = null;
  try {
    const attrs = extractUserAttributes(profile, connection);
    const email = attrs.email.trim().toLowerCase();
    const emailDomain = email.split('@')[1]?.toLowerCase();

    if (!emailDomain) {
      throw new Error('Invalid email address returned by identity provider');
    }

    const allowedDomains = (connection.emailDomains || []).map((d) => d.toLowerCase());
    if (allowedDomains.length > 0 && !allowedDomains.includes(emailDomain)) {
      throw new Error(`Email domain ${emailDomain} not allowed for this SSO connection`);
    }

    const displayName =
      attrs.displayName ||
      [attrs.firstName, attrs.lastName].filter(Boolean).join(' ').trim() ||
      email;

    // Find or create profile
    const { data: existingProfile, error: existingError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existingError) {
      throw new Error(existingError.message);
    }

    if (existingProfile?.id) {
      userId = existingProfile.id as string;
      await supabase
        .from('profiles')
        .update({ full_name: displayName, updated_at: new Date().toISOString() })
        .eq('id', userId);
    } else {
      userId = randomUUID();
      const { error: insertError } = await supabase.from('profiles').insert({
        id: userId,
        email,
        full_name: displayName,
        plan: 'free',
      });

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    // Ensure organization membership
    await supabase.from('organization_members').upsert(
      {
        organization_id: org.id,
        user_id: userId,
        role: connection.settings?.defaultRole || 'member',
      },
      { onConflict: 'organization_id,user_id' }
    );

    // Record SSO session (best-effort; does not gate login)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyProfile = profile as any;
      await supabase.from('sso_sessions').insert({
        user_id: userId,
        organization_id: org.id,
        connection_id: connection.id,
        provider: 'saml',
        idp_session_id: anyProfile.sessionIndex || anyProfile.nameID || null,
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: request.headers.get('user-agent'),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch {
      // ignore
    }

    // Mark login attempt as success (best-effort)
    try {
      if (inResponseTo) {
        await supabase
          .from('sso_login_attempts')
          .update({
            response_status: 'success',
            user_id: userId,
            email,
            ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            user_agent: request.headers.get('user-agent'),
          })
          .eq('organization_id', org.id)
          .eq('request_id', inResponseTo);
      } else {
        await supabase.from('sso_login_attempts').insert({
          connection_id: connection.id,
          organization_id: org.id,
          response_status: 'success',
          user_id: userId,
          email,
          ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          user_agent: request.headers.get('user-agent'),
        });
      }
    } catch {
      // ignore
    }

    // Establish Auth.js session
    const sessionToken = await createAuthJsSessionToken({
      userId,
      email,
      name: displayName,
    });

    const response = NextResponse.redirect(new URL(redirectPath, baseUrl));

    const useSecureCookies = process.env.NODE_ENV === 'production';
    const cookiePrefix = useSecureCookies ? '__Secure-' : '';
    const cookieDomain = getCookieDomain(baseUrl);

    response.cookies.set(`${cookiePrefix}authjs.session-token`, sessionToken, {
      httpOnly: true,
      secure: useSecureCookies,
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    return response;
  } catch (err) {
    console.error('SAML ACS provisioning error:', err);

    // Mark attempt as error when possible.
    try {
      if (inResponseTo) {
        await supabase
          .from('sso_login_attempts')
          .update({
            response_status: 'error',
            error_code: 'USER_PROVISIONING_FAILED',
            error_message: err instanceof Error ? err.message : 'Provisioning failed',
            user_id: userId,
          })
          .eq('organization_id', org.id)
          .eq('request_id', inResponseTo);
      } else {
        await supabase.from('sso_login_attempts').insert({
          connection_id: connection.id,
          organization_id: org.id,
          response_status: 'error',
          error_code: 'USER_PROVISIONING_FAILED',
          error_message: err instanceof Error ? err.message : 'Provisioning failed',
          user_id: userId,
        });
      }
    } catch {
      // ignore
    }

    const errorUrl = new URL('/login', baseUrl);
    errorUrl.searchParams.set('error', 'sso_provisioning_failed');
    errorUrl.searchParams.set(
      'error_description',
      err instanceof Error ? err.message : 'Provisioning failed'
    );
    return NextResponse.redirect(errorUrl);
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;

  const formData = await request.formData();
  const samlResponse = formData.get('SAMLResponse');
  const relayState = formData.get('RelayState');

  if (typeof samlResponse !== 'string' || !samlResponse) {
    return NextResponse.redirect(new URL('/login?error=missing_saml_response', getBaseUrl(request)));
  }

  return handleAcs(
    request,
    orgSlug,
    samlResponse,
    typeof relayState === 'string' ? relayState : null
  );
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { orgSlug } = await params;

  const samlResponse = request.nextUrl.searchParams.get('SAMLResponse');
  const relayState = request.nextUrl.searchParams.get('RelayState');

  if (!samlResponse) {
    return NextResponse.redirect(new URL('/login?error=missing_saml_response', getBaseUrl(request)));
  }

  return handleAcs(request, orgSlug, samlResponse, relayState);
}
