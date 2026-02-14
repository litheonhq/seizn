import 'server-only';

/**
 * SAML SSO Provider (production implementation)
 *
 * This module uses `@node-saml/node-saml` to:
 * - Generate SAML AuthnRequest redirect URLs
 * - Validate SAML POST responses (signature, audience, timestamps)
 * - Extract user attributes from the validated SAML profile
 *
 * Replay protection:
 * - We use `sso_login_attempts` as the request ID cache.
 * - `cacheProvider.getAsync` validates that the requestId exists and is still pending.
 * - `cacheProvider.removeAsync` marks the requestId as consumed ("processing") so it cannot be replayed.
 */

import { SAML, ValidateInResponseTo, generateServiceProviderMetadata } from '@node-saml/node-saml';
import type { CacheItem, CacheProvider, Profile, SamlConfig } from '@node-saml/node-saml';
import { randomUUID } from 'crypto';
import { createServerClient } from '@/lib/supabase';
import type { SSOConnection, SSOError } from '@/types/sso';

const REQUEST_ID_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

function getBaseUrl(): string {
  return process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';
}

function getSpPrivateKey(): string | undefined {
  return process.env.SSO_SAML_SP_PRIVATE_KEY || process.env.SAML_SP_PRIVATE_KEY;
}

function getSpPublicCert(): string | undefined {
  return process.env.SSO_SAML_SP_PUBLIC_CERT || process.env.SAML_SP_PUBLIC_CERT;
}

function normalizePemBlock(value: string, label: 'CERTIFICATE' | 'PRIVATE KEY'): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes('-----BEGIN')) return trimmed;

  const body = trimmed.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) || [body];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
}

function normalizeIdpCertificate(cert: string): string {
  return normalizePemBlock(cert, 'CERTIFICATE');
}

function normalizePrivateKey(key: string): string {
  return normalizePemBlock(key, 'PRIVATE KEY');
}

function createLoginAttemptCacheProvider(connectionId: string): CacheProvider {
  return {
    async saveAsync(key: string, value: string): Promise<CacheItem | null> {
      // `@node-saml/node-saml` persists request IDs here, but we store the attempt
      // in `sso_login_attempts` in the initiate route (where we have more context).
      return { value, createdAt: Date.now() };
    },

    async getAsync(key: string): Promise<string | null> {
      if (!key) return null;

      const supabase = createServerClient();
      const { data, error } = await supabase
        .from('sso_login_attempts')
        .select('created_at, response_status')
        .eq('connection_id', connectionId)
        .eq('request_id', key)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) return null;

      const row = data[0] as { created_at: string; response_status: string | null };
      if (row.response_status !== 'pending') return null;

      const createdAtMs = new Date(row.created_at).getTime();
      if (!Number.isFinite(createdAtMs)) return null;
      if (Date.now() > createdAtMs + REQUEST_ID_TTL_MS) return null;

      // The library expects a date-like string so it can check TTL.
      return row.created_at;
    },

    async removeAsync(key: string | null): Promise<string | null> {
      if (!key) return null;

      const supabase = createServerClient();
      await supabase
        .from('sso_login_attempts')
        .update({ response_status: 'processing' })
        .eq('connection_id', connectionId)
        .eq('request_id', key)
        .eq('response_status', 'pending');

      return null;
    },
  };
}

function buildSamlConfig(connection: SSOConnection): SamlConfig {
  if (!connection.ssoUrl) {
    throw new Error('SSO URL not configured');
  }
  if (!connection.entityId) {
    throw new Error('IdP entity ID not configured');
  }
  if (!connection.certificate) {
    throw new Error('IdP certificate not configured');
  }

  const idpCert = normalizeIdpCertificate(connection.certificate);

  let lastGeneratedId: string | null = null;
  const generateUniqueId = () => {
    // SAML IDs are typically prefixed with '_' and must be unique.
    const id = `_${randomUUID().replace(/-/g, '')}`;
    lastGeneratedId = id;
    return id;
  };

  const validateInResponseTo = connection.settings.allowIdpInitiated
    ? ValidateInResponseTo.ifPresent
    : ValidateInResponseTo.always;

  const authnContext = connection.settings.authnContextClassRef
    ? [connection.settings.authnContextClassRef]
    : [];

  const cfg: SamlConfig = {
    // Mandatory:
    idpCert,
    issuer: connection.spEntityId,
    callbackUrl: connection.spAcsUrl,

    // IdP endpoints:
    entryPoint: connection.ssoUrl,
    logoutUrl: connection.sloUrl || '',

    // Validation:
    idpIssuer: connection.entityId,
    audience: connection.spEntityId,
    acceptedClockSkewMs: CLOCK_SKEW_MS,
    maxAssertionAgeMs: 10 * 60 * 1000,
    validateInResponseTo,
    requestIdExpirationPeriodMs: REQUEST_ID_TTL_MS,
    cacheProvider: createLoginAttemptCacheProvider(connection.id),

    // Requested attributes:
    identifierFormat: connection.settings.nameIdFormat || null,
    allowCreate: true,
    disableRequestedAuthnContext: authnContext.length === 0,
    authnContext,
    forceAuthn: Boolean(connection.settings.forceAuthn),
    passive: false,

    // Signature requirements:
    wantAuthnResponseSigned: false,
    wantAssertionsSigned: Boolean(connection.settings.wantAssertionsSigned),

    // Request signing:
    generateUniqueId,
  };

  if (connection.settings.signRequest) {
    const pk = getSpPrivateKey();
    if (!pk) {
      throw new Error('SP request signing is enabled but SSO_SAML_SP_PRIVATE_KEY is not configured');
    }

    cfg.privateKey = normalizePrivateKey(pk);
    const publicCert = getSpPublicCert();
    if (publicCert) cfg.publicCert = normalizeIdpCertificate(publicCert);
    cfg.signatureAlgorithm = 'sha256';
  }

  // Expose for callers that need the request id.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cfg as any).__getLastGeneratedId = () => lastGeneratedId;

  return cfg;
}

export async function generateSAMLRequest(
  connection: SSOConnection,
  relayState?: string
): Promise<{ requestId: string; redirectUrl: string }> {
  const config = buildSamlConfig(connection);
  const saml = new SAML(config);

  const url = await saml.getAuthorizeUrlAsync(relayState || '', getBaseUrl(), {
    additionalParams: {},
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestId = (config as any).__getLastGeneratedId?.() as string | null;
  if (!requestId) {
    throw new Error('Failed to capture SAML request ID');
  }

  return { requestId, redirectUrl: url };
}

export async function parseSAMLResponse(
  samlResponse: string,
  connection: SSOConnection
): Promise<{ profile: Profile } | { error: SSOError }> {
  try {
    if (!samlResponse) {
      return { error: { code: 'INVALID_SAML_RESPONSE', message: 'Empty SAML response' } };
    }

    const config = buildSamlConfig(connection);
    const saml = new SAML(config);

    const result = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
    if (result.loggedOut || !result.profile) {
      return {
        error: {
          code: 'INVALID_SAML_RESPONSE',
          message: 'SAML response did not contain a valid user profile',
        },
      };
    }

    return { profile: result.profile };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to validate SAML response';
    return { error: { code: 'INVALID_SAML_RESPONSE', message: msg } };
  }
}

function readProfileValue(profile: Profile, key: string): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (profile as any)?.[key];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

function readProfileValues(profile: Profile, key: string): string[] | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (profile as any)?.[key];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) {
    const values = raw.filter((v) => typeof v === 'string') as string[];
    return values.length ? values : undefined;
  }
  return undefined;
}

export function extractUserAttributes(
  profile: Profile,
  connection: SSOConnection
): {
  email: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  groups?: string[];
} {
  const mapping = connection.attributeMapping;

  const email =
    (mapping.email ? readProfileValue(profile, mapping.email) : undefined) ||
    readProfileValue(profile, 'email') ||
    readProfileValue(profile, 'mail') ||
    readProfileValue(profile, 'urn:oid:0.9.2342.19200300.100.1.3') ||
    profile.nameID;

  if (!email) {
    throw new Error('Email not provided by identity provider');
  }

  const firstName = mapping.firstName ? readProfileValue(profile, mapping.firstName) : undefined;
  const lastName = mapping.lastName ? readProfileValue(profile, mapping.lastName) : undefined;
  const displayName =
    (mapping.displayName ? readProfileValue(profile, mapping.displayName) : undefined) ||
    readProfileValue(profile, 'displayName') ||
    readProfileValue(profile, 'name');
  const groups = mapping.groups ? readProfileValues(profile, mapping.groups) : undefined;

  return { email, firstName, lastName, displayName, groups };
}

export function generateFullSPMetadataXML(connection: SSOConnection): string {
  const publicCert = getSpPublicCert();
  const wantsSignedRequests = Boolean(connection.settings.signRequest && publicCert);

  return generateServiceProviderMetadata({
    issuer: connection.spEntityId,
    callbackUrl: connection.spAcsUrl,
    identifierFormat: connection.settings.nameIdFormat || undefined,
    wantAssertionsSigned: Boolean(connection.settings.wantAssertionsSigned),
    publicCerts: wantsSignedRequests && publicCert ? normalizeIdpCertificate(publicCert) : null,
    signMetadata: false,
    metadataOrganization: {
      OrganizationName: [{ '@xml:lang': 'en', '#text': 'Seizn' }],
      OrganizationDisplayName: [{ '@xml:lang': 'en', '#text': 'Seizn AI Memory' }],
      OrganizationURL: [{ '@xml:lang': 'en', '#text': 'https://www.seizn.com' }],
    },
    metadataContactPerson: [
      {
        '@contactType': 'technical',
        GivenName: 'Seizn',
        SurName: 'Support',
        EmailAddress: ['support@seizn.com'],
      },
    ],
  });
}
