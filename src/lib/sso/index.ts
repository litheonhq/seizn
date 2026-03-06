/**
 * SSO/SAML Core Library
 *
 * Core functionality for SSO connection management,
 * SAML request/response handling, and domain verification.
 */

import { createServerClient } from '@/lib/supabase';
import type {
  SSOConnection,
  SSOConnectionStatus,
  SSOProviderType,
  SSOSettings,
  SSOAttributeMapping,
  SSODomainVerification,
  SAMLServiceProviderMetadata,
} from '@/types/sso';
import {
  DEFAULT_SSO_SETTINGS,
  DEFAULT_ATTRIBUTE_MAPPING,
} from '@/types/sso';
import { randomUUID } from 'crypto';
import { encryptSSOSecret } from './secret';
import { verifyDomainOwnership } from './domain-verification';
import { logServerError } from '@/lib/server/logger';

// ============================================
// Constants
// ============================================

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.seizn.com';

// ============================================
// SSO Connection Management
// ============================================

/**
 * Get all SSO connections for an organization
 */
export async function getSSOConnections(organizationId: string): Promise<SSOConnection[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('sso_connections')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    logServerError('Failed to fetch SSO connections', error);
    throw new Error('Failed to fetch SSO connections');
  }

  return (data || []).map(mapDbToSSOConnection);
}

/**
 * Get a single SSO connection by ID
 */
export async function getSSOConnection(
  connectionId: string,
  organizationId?: string
): Promise<SSOConnection | null> {
  const supabase = createServerClient();

  let query = supabase.from('sso_connections').select('*').eq('id', connectionId);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  return mapDbToSSOConnection(data);
}

/**
 * Create a new SSO connection
 */
export async function createSSOConnection(
  organizationId: string,
  name: string,
  providerType: SSOProviderType = 'saml',
  createdBy?: string
): Promise<SSOConnection> {
  const supabase = createServerClient();

  // Get org slug for SP URLs
  const { data: org } = await supabase
    .from('organizations')
    .select('slug')
    .eq('id', organizationId)
    .single();

  if (!org) {
    throw new Error('Organization not found');
  }

  const spEntityId = `${BASE_URL}/api/sso/saml/${org.slug}/metadata`;
  const spAcsUrl = `${BASE_URL}/api/sso/saml/${org.slug}/acs`;

  const { data, error } = await supabase
    .from('sso_connections')
    .insert({
      organization_id: organizationId,
      name,
      provider_type: providerType,
      sp_entity_id: spEntityId,
      sp_acs_url: spAcsUrl,
      sp_metadata_url: spEntityId,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error || !data) {
    logServerError('Failed to create SSO connection', error);
    throw new Error('Failed to create SSO connection');
  }

  return mapDbToSSOConnection(data);
}

/**
 * Update an SSO connection
 */
export async function updateSSOConnection(
  connectionId: string,
  organizationId: string,
  updates: {
    name?: string;
    status?: SSOConnectionStatus;
    entityId?: string;
    ssoUrl?: string;
    sloUrl?: string;
    certificate?: string;
    oidcIssuer?: string;
    oidcClientId?: string;
    oidcClientSecret?: string;
    emailDomains?: string[];
    attributeMapping?: Partial<SSOAttributeMapping>;
    settings?: Partial<SSOSettings>;
  }
): Promise<SSOConnection> {
  const supabase = createServerClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbUpdates: Record<string, any> = {};

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.entityId !== undefined) dbUpdates.entity_id = updates.entityId;
  if (updates.ssoUrl !== undefined) dbUpdates.sso_url = updates.ssoUrl;
  if (updates.sloUrl !== undefined) dbUpdates.slo_url = updates.sloUrl;
  if (updates.certificate !== undefined) dbUpdates.certificate = updates.certificate;
  if (updates.oidcIssuer !== undefined) dbUpdates.oidc_issuer = updates.oidcIssuer;
  if (updates.oidcClientId !== undefined) dbUpdates.oidc_client_id = updates.oidcClientId;
  if (updates.emailDomains !== undefined) dbUpdates.email_domains = updates.emailDomains;

  // Handle encrypted client secret separately (in production, encrypt before storing)
  if (updates.oidcClientSecret !== undefined) {
    dbUpdates.oidc_client_secret_encrypted = updates.oidcClientSecret
      ? encryptSSOSecret(updates.oidcClientSecret)
      : null;
  }

  // Merge attribute mapping and settings with existing values
  if (updates.attributeMapping || updates.settings) {
    const existing = await getSSOConnection(connectionId, organizationId);
    if (existing) {
      if (updates.attributeMapping) {
        dbUpdates.attribute_mapping = {
          ...existing.attributeMapping,
          ...updates.attributeMapping,
        };
      }
      if (updates.settings) {
        dbUpdates.settings = {
          ...existing.settings,
          ...updates.settings,
        };
      }
    }
  }

  const { data, error } = await supabase
    .from('sso_connections')
    .update(dbUpdates)
    .eq('id', connectionId)
    .eq('organization_id', organizationId)
    .select()
    .single();

  if (error || !data) {
    logServerError('Failed to update SSO connection', error);
    throw new Error('Failed to update SSO connection');
  }

  return mapDbToSSOConnection(data);
}

/**
 * Delete an SSO connection
 */
export async function deleteSSOConnection(
  connectionId: string,
  organizationId: string
): Promise<void> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from('sso_connections')
    .delete()
    .eq('id', connectionId)
    .eq('organization_id', organizationId);

  if (error) {
    logServerError('Failed to delete SSO connection', error);
    throw new Error('Failed to delete SSO connection');
  }
}

// ============================================
// Domain Verification
// ============================================

/**
 * Start domain verification process
 */
export async function startDomainVerification(
  organizationId: string,
  domain: string,
  method: 'dns_txt' | 'dns_cname' | 'meta_tag' | 'file' = 'dns_txt'
): Promise<SSODomainVerification> {
  const supabase = createServerClient();

  // Generate verification token
  const verificationToken = `seizn-verify=${randomUUID().replace(/-/g, '')}`;

  const { data, error } = await supabase
    .from('sso_domain_verifications')
    .upsert(
      {
        organization_id: organizationId,
        domain: domain.toLowerCase(),
        verification_method: method,
        verification_token: verificationToken,
        is_verified: false,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        onConflict: 'organization_id,domain',
      }
    )
    .select()
    .single();

  if (error || !data) {
    logServerError('Failed to start domain verification', error);
    throw new Error('Failed to start domain verification');
  }

  return mapDbToDomainVerification(data);
}

/**
 * Complete domain verification (check DNS/file)
 */
export async function verifyDomain(verificationId: string): Promise<SSODomainVerification> {
  const supabase = createServerClient();

  const { data: verification, error: fetchError } = await supabase
    .from('sso_domain_verifications')
    .select('*')
    .eq('id', verificationId)
    .single();

  if (fetchError || !verification) {
    throw new Error('Verification not found');
  }

  // Check if expired
  if (new Date(verification.expires_at) < new Date()) {
    throw new Error('Verification token expired');
  }

  const isVerified = await verifyDomainOwnership(
    verification.domain,
    verification.verification_token,
    verification.verification_method
  );

  if (!isVerified) {
    throw new Error('Domain verification failed');
  }

  const { data, error } = await supabase
    .from('sso_domain_verifications')
    .update({
      is_verified: true,
      verified_at: new Date().toISOString(),
    })
    .eq('id', verificationId)
    .select()
    .single();

  if (error || !data) {
    throw new Error('Failed to update verification status');
  }

  return mapDbToDomainVerification(data);
}


// ============================================
// SP Metadata Generation
// ============================================

/**
 * Generate Service Provider metadata for SAML
 */
export function generateSPMetadata(connection: SSOConnection): SAMLServiceProviderMetadata {
  return {
    entityId: connection.spEntityId,
    acsUrl: connection.spAcsUrl,
    nameIdFormat: connection.settings.nameIdFormat,
    wantAuthnRequestsSigned: connection.settings.signRequest,
    wantAssertionsSigned: connection.settings.wantAssertionsSigned,
  };
}

/**
 * Generate SP Metadata XML
 */
export function generateSPMetadataXML(connection: SSOConnection): string {
  const metadata = generateSPMetadata(connection);

  return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
                     entityID="${escapeXml(metadata.entityId)}">
  <md:SPSSODescriptor
      AuthnRequestsSigned="${metadata.wantAuthnRequestsSigned}"
      WantAssertionsSigned="${metadata.wantAssertionsSigned}"
      protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>${escapeXml(metadata.nameIdFormat)}</md:NameIDFormat>
    <md:AssertionConsumerService
        Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        Location="${escapeXml(metadata.acsUrl)}"
        index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
}

// ============================================
// SSO Discovery
// ============================================

/**
 * Find SSO connection by email domain
 */
export async function findSSOConnectionByEmail(email: string): Promise<SSOConnection | null> {
  const supabase = createServerClient();

  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) {
    return null;
  }

  const { data, error } = await supabase.rpc('find_sso_connection_by_email', {
    p_email: email,
  });

  if (error || !data || data.length === 0) {
    return null;
  }

  // Get full connection details
  return getSSOConnection(data[0].connection_id);
}

// ============================================
// Helpers
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToSSOConnection(data: any): SSOConnection {
  return {
    id: data.id,
    organizationId: data.organization_id,
    name: data.name,
    providerType: data.provider_type,
    status: data.status,
    entityId: data.entity_id,
    ssoUrl: data.sso_url,
    sloUrl: data.slo_url,
    certificate: data.certificate,
    oidcIssuer: data.oidc_issuer,
    oidcClientId: data.oidc_client_id,
    spEntityId: data.sp_entity_id,
    spAcsUrl: data.sp_acs_url,
    spMetadataUrl: data.sp_metadata_url,
    emailDomains: data.email_domains || [],
    attributeMapping: data.attribute_mapping || DEFAULT_ATTRIBUTE_MAPPING,
    settings: data.settings || DEFAULT_SSO_SETTINGS,
    createdBy: data.created_by,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    lastTestedAt: data.last_tested_at,
    lastUsedAt: data.last_used_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbToDomainVerification(data: any): SSODomainVerification {
  return {
    id: data.id,
    organizationId: data.organization_id,
    domain: data.domain,
    verificationMethod: data.verification_method,
    verificationToken: data.verification_token,
    isVerified: data.is_verified,
    verifiedAt: data.verified_at,
    expiresAt: data.expires_at,
    createdAt: data.created_at,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Re-export types
export type { SSOConnection, SSODomainVerification, SSOSettings, SSOAttributeMapping };
