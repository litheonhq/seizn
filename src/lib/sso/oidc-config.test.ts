import { describe, expect, it } from 'vitest';

import { buildOIDCConfigFromConnection, type OidcConnectionRecord } from './oidc-config';

function makeConnection(
  overrides: Partial<OidcConnectionRecord> = {}
): OidcConnectionRecord {
  return {
    id: 'conn_1',
    organization_id: 'org_1',
    name: 'Test OIDC',
    provider_type: 'oidc',
    status: 'active',
    oidc_issuer: 'https://issuer.example.com',
    oidc_client_id: 'client_id',
    oidc_client_secret_encrypted: 'client_secret_plain',
    email_domains: ['example.com'],
    domains: ['example.com'],
    ...overrides,
  };
}

describe('buildOIDCConfigFromConnection', () => {
  it('throws when client id is missing', () => {
    expect(() =>
      buildOIDCConfigFromConnection(makeConnection({ oidc_client_id: null }))
    ).toThrow('OIDC client ID not configured');
  });

  it('throws when client secret is missing', () => {
    expect(() =>
      buildOIDCConfigFromConnection(makeConnection({ oidc_client_secret_encrypted: null }))
    ).toThrow('OIDC client secret not configured');
  });

  it('throws when issuer is missing', () => {
    expect(() =>
      buildOIDCConfigFromConnection(makeConnection({ oidc_issuer: null }))
    ).toThrow('OIDC issuer not configured');
  });

  it('maps connection into discoverable OIDC config', () => {
    const config = buildOIDCConfigFromConnection(makeConnection());

    expect(config).toEqual(
      expect.objectContaining({
        type: 'oidc',
        clientId: 'client_id',
        clientSecret: 'client_secret_plain',
        issuerUrl: 'https://issuer.example.com',
        authorizationUrl: '',
        tokenUrl: '',
        userInfoUrl: '',
        scopes: ['openid', 'email', 'profile'],
      })
    );
  });
});

