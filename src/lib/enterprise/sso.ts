/**
 * SSO Service
 *
 * Handle SAML and OIDC authentication flows
 */

import type {
  SSOConfig,
  SSOProvider,
  SAMLConfig,
  OIDCConfig,
  SSOSession,
} from './types';

export class SSOService {
  private configs: Map<string, SSOConfig> = new Map();

  /**
   * Register SSO configuration for an organization
   */
  async registerConfig(config: SSOConfig): Promise<void> {
    this.configs.set(config.orgId, config);
  }

  /**
   * Get SSO config by organization ID
   */
  getConfig(orgId: string): SSOConfig | undefined {
    return this.configs.get(orgId);
  }

  /**
   * Get SSO config by email domain
   */
  getConfigByDomain(email: string): SSOConfig | undefined {
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return undefined;

    for (const config of this.configs.values()) {
      if (config.enabled && config.domains.includes(domain)) {
        return config;
      }
    }
    return undefined;
  }

  /**
   * Generate SAML authentication request
   */
  generateSAMLRequest(config: SSOConfig): { url: string; requestId: string } {
    if (config.config.type !== 'saml') {
      throw new Error('Config is not SAML');
    }

    const samlConfig = config.config as SAMLConfig;
    const requestId = `_${crypto.randomUUID()}`;

    // In production, this would generate a proper SAML AuthnRequest
    // Using a library like passport-saml or saml2-js
    const request = this.buildSAMLAuthnRequest(requestId, samlConfig);

    const url = new URL(samlConfig.entryPoint);
    url.searchParams.set('SAMLRequest', Buffer.from(request).toString('base64'));

    return {
      url: url.toString(),
      requestId,
    };
  }

  /**
   * Build SAML AuthnRequest XML
   */
  private buildSAMLAuthnRequest(requestId: string, config: SAMLConfig): string {
    const now = new Date().toISOString();

    return `<?xml version="1.0"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${now}"
  AssertionConsumerServiceURL="${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/callback"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${config.issuer}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:${config.nameIdFormat}" AllowCreate="true"/>
</samlp:AuthnRequest>`;
  }

  /**
   * Process SAML response
   */
  async processSAMLResponse(
    config: SSOConfig,
    samlResponse: string
  ): Promise<{ user: { email: string; firstName: string; lastName: string; groups?: string[] }; session: Partial<SSOSession> }> {
    if (config.config.type !== 'saml') {
      throw new Error('Config is not SAML');
    }

    const samlConfig = config.config as SAMLConfig;

    // In production, this would:
    // 1. Decode and parse the SAML response
    // 2. Verify the signature using config.cert
    // 3. Validate assertions (audience, recipient, timestamps)
    // 4. Extract user attributes based on attributeMapping

    // Mock implementation
    const decodedResponse = Buffer.from(samlResponse, 'base64').toString('utf-8');

    // Parse XML and extract attributes (simplified)
    const attributes = this.extractSAMLAttributes(decodedResponse, samlConfig.attributeMapping);

    return {
      user: {
        email: attributes.email,
        firstName: attributes.firstName,
        lastName: attributes.lastName,
        groups: attributes.groups,
      },
      session: {
        provider: 'saml',
        ssoConfigId: config.id,
        attributes: attributes as Record<string, unknown>,
      },
    };
  }

  /**
   * Extract attributes from SAML response
   */
  private extractSAMLAttributes(
    response: string,
    mapping: SAMLConfig['attributeMapping']
  ): { email: string; firstName: string; lastName: string; groups?: string[] } {
    // Simplified extraction - in production use proper XML parsing
    const extractValue = (attrName: string): string => {
      const regex = new RegExp(`Name="${attrName}"[^>]*>\\s*<[^>]+>([^<]+)<`, 'i');
      const match = response.match(regex);
      return match?.[1] || '';
    };

    return {
      email: extractValue(mapping.email),
      firstName: extractValue(mapping.firstName),
      lastName: extractValue(mapping.lastName),
      groups: mapping.groups ? extractValue(mapping.groups).split(',') : undefined,
    };
  }

  /**
   * Generate OIDC authorization URL
   */
  generateOIDCAuthURL(config: SSOConfig, state: string): string {
    if (config.config.type !== 'oidc') {
      throw new Error('Config is not OIDC');
    }

    const oidcConfig = config.config as OIDCConfig;
    const url = new URL(oidcConfig.authorizationEndpoint);

    url.searchParams.set('client_id', oidcConfig.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/callback`);
    url.searchParams.set('scope', oidcConfig.scopes.join(' '));
    url.searchParams.set('state', state);

    return url.toString();
  }

  /**
   * Exchange OIDC authorization code for tokens
   */
  async exchangeOIDCCode(
    config: SSOConfig,
    code: string
  ): Promise<{ accessToken: string; idToken: string; refreshToken?: string }> {
    if (config.config.type !== 'oidc') {
      throw new Error('Config is not OIDC');
    }

    const oidcConfig = config.config as OIDCConfig;

    const response = await fetch(oidcConfig.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: oidcConfig.clientId,
        client_secret: oidcConfig.clientSecret,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/callback`,
      }),
    });

    if (!response.ok) {
      throw new Error('Token exchange failed');
    }

    const tokens = (await response.json()) as {
      access_token: string;
      id_token: string;
      refresh_token?: string;
    };

    return {
      accessToken: tokens.access_token,
      idToken: tokens.id_token,
      refreshToken: tokens.refresh_token,
    };
  }

  /**
   * Get user info from OIDC userinfo endpoint
   */
  async getOIDCUserInfo(
    config: SSOConfig,
    accessToken: string
  ): Promise<{ email: string; firstName: string; lastName: string; groups?: string[] }> {
    if (config.config.type !== 'oidc') {
      throw new Error('Config is not OIDC');
    }

    const oidcConfig = config.config as OIDCConfig;

    const response = await fetch(oidcConfig.userInfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = (await response.json()) as Record<string, unknown>;
    const mapping = oidcConfig.attributeMapping;

    return {
      email: String(userInfo[mapping.email] || ''),
      firstName: String(userInfo[mapping.firstName] || ''),
      lastName: String(userInfo[mapping.lastName] || ''),
      groups: mapping.groups ? (userInfo[mapping.groups] as string[]) : undefined,
    };
  }

  /**
   * Generate SP metadata for SAML
   */
  generateSPMetadata(_config: SSOConfig): string {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.seizn.com';

    return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${baseUrl}/api/auth/sso/metadata">
  <md:SPSSODescriptor AuthnRequestsSigned="true" WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${baseUrl}/api/auth/sso/callback"
      index="0"
      isDefault="true"/>
    <md:SingleLogoutService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${baseUrl}/api/auth/sso/logout"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  /**
   * Get supported providers
   */
  static getSupportedProviders(): Array<{
    id: SSOProvider;
    name: string;
    description: string;
    configType: 'saml' | 'oidc';
  }> {
    return [
      {
        id: 'okta',
        name: 'Okta',
        description: 'Enterprise identity management',
        configType: 'saml',
      },
      {
        id: 'azure-ad',
        name: 'Azure AD',
        description: 'Microsoft Azure Active Directory',
        configType: 'oidc',
      },
      {
        id: 'google-workspace',
        name: 'Google Workspace',
        description: 'Google Workspace SSO',
        configType: 'oidc',
      },
      {
        id: 'onelogin',
        name: 'OneLogin',
        description: 'OneLogin identity platform',
        configType: 'saml',
      },
      {
        id: 'saml',
        name: 'Custom SAML 2.0',
        description: 'Any SAML 2.0 compliant IdP',
        configType: 'saml',
      },
      {
        id: 'oidc',
        name: 'Custom OIDC',
        description: 'Any OpenID Connect provider',
        configType: 'oidc',
      },
    ];
  }
}

// Singleton instance
let ssoInstance: SSOService | null = null;

export function getSSOService(): SSOService {
  if (!ssoInstance) {
    ssoInstance = new SSOService();
  }
  return ssoInstance;
}
