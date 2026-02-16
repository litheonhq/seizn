import type { OIDCConfig } from '@/lib/enterprise-auth/types';
import { decryptSSOSecret } from '@/lib/sso/secret';

export type OidcConnectionRecord = {
  id: string;
  organization_id: string;
  name: string;
  provider_type: 'saml' | 'oidc';
  status: 'draft' | 'testing' | 'active' | 'disabled';
  oidc_issuer: string | null;
  oidc_client_id: string | null;
  oidc_client_secret_encrypted: string | null;
  email_domains: string[] | null;
  domains?: string[] | null;
};

export function buildOIDCConfigFromConnection(connection: OidcConnectionRecord): OIDCConfig {
  if (!connection.oidc_client_id) {
    throw new Error('OIDC client ID not configured');
  }

  if (!connection.oidc_client_secret_encrypted) {
    throw new Error('OIDC client secret not configured');
  }

  if (!connection.oidc_issuer) {
    throw new Error('OIDC issuer not configured');
  }

  return {
    type: 'oidc',
    clientId: connection.oidc_client_id,
    clientSecret: decryptSSOSecret(connection.oidc_client_secret_encrypted),
    issuerUrl: connection.oidc_issuer,
    // Prefer provider discovery when explicit endpoints are not set.
    authorizationUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    scopes: ['openid', 'email', 'profile'],
    attributeMapping: {
      email: 'email',
      name: 'name',
      picture: 'picture',
      groups: 'groups',
    },
  };
}

