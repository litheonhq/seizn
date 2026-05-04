/**
 * OIDC Provider for Enterprise SSO
 *
 * Dynamic OIDC provider that reads configuration from database
 * and supports multiple IdPs per organization.
 */

import type { OIDCConfig, SSOConnection } from './types';
import { createServerClient } from '@/lib/supabase';

// ============================================
// Types
// ============================================

export interface OIDCDiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
}

export interface OIDCTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  scope?: string;
}

export interface OIDCUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  locale?: string;
  groups?: string[];
  [key: string]: unknown;
}

export interface OIDCAuthRequest {
  connectionId: string;
  state: string;
  nonce: string;
  redirectUri: string;
  codeVerifier?: string;
}

// ============================================
// OIDC Provider Service
// ============================================

export class OIDCProvider {
  private discoveryCache = new Map<string, { document: OIDCDiscoveryDocument; expiresAt: number }>();

  /**
   * Fetch OIDC Discovery Document
   */
  async getDiscoveryDocument(issuerUrl: string): Promise<OIDCDiscoveryDocument> {
    // Check cache
    const cached = this.discoveryCache.get(issuerUrl);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.document;
    }

    // Fetch discovery document
    const wellKnownUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch OIDC discovery document: ${response.status}`);
    }

    const document = await response.json() as OIDCDiscoveryDocument;

    // Cache for 1 hour
    this.discoveryCache.set(issuerUrl, {
      document,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    return document;
  }

  /**
   * Generate Authorization URL
   */
  async generateAuthorizationUrl(
    config: OIDCConfig,
    state: string,
    nonce: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<string> {
    let authUrl = config.authorizationUrl;

    // If not explicitly configured, get from discovery
    if (!authUrl) {
      const discovery = await this.getDiscoveryDocument(config.issuerUrl);
      authUrl = discovery.authorization_endpoint;
    }

    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: config.scopes.join(' '),
      redirect_uri: redirectUri,
      state,
      nonce,
    });

    // Add PKCE if code verifier provided
    if (codeVerifier) {
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    }

    return `${authUrl}?${params.toString()}`;
  }

  /**
   * Exchange Authorization Code for Tokens
   */
  async exchangeCode(
    config: OIDCConfig,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OIDCTokenResponse> {
    let tokenUrl = config.tokenUrl;

    // If not explicitly configured, get from discovery
    if (!tokenUrl) {
      const discovery = await this.getDiscoveryDocument(config.issuerUrl);
      tokenUrl = discovery.token_endpoint;
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    });

    if (codeVerifier) {
      params.set('code_verifier', codeVerifier);
    }

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * Get User Info from OIDC Provider
   */
  async getUserInfo(
    config: OIDCConfig,
    accessToken: string
  ): Promise<OIDCUserInfo> {
    let userInfoUrl = config.userInfoUrl;

    // If not explicitly configured, get from discovery
    if (!userInfoUrl) {
      const discovery = await this.getDiscoveryDocument(config.issuerUrl);
      userInfoUrl = discovery.userinfo_endpoint;
    }

    const response = await fetch(userInfoUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Parse and Validate ID Token
   */
  parseIdToken(idToken: string): Record<string, unknown> {
    const parts = idToken.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid ID token format');
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );

    return payload;
  }

  /**
   * Validate ID Token Claims
   */
  validateIdToken(
    claims: Record<string, unknown>,
    config: OIDCConfig,
    nonce: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check issuer
    if (claims.iss !== config.issuerUrl) {
      errors.push(`Invalid issuer: expected ${config.issuerUrl}, got ${claims.iss}`);
    }

    // Check audience
    const audValid = claims.aud === config.clientId ||
      (Array.isArray(claims.aud) && claims.aud.includes(config.clientId));
    if (!audValid) {
      errors.push(`Invalid audience: expected ${config.clientId}`);
    }

    // Check nonce
    if (claims.nonce !== nonce) {
      errors.push('Invalid nonce');
    }

    // Check expiration
    const exp = claims.exp as number;
    if (exp && exp * 1000 < Date.now()) {
      errors.push('ID token has expired');
    }

    // Check issued at (not too old)
    const iat = claims.iat as number;
    if (iat && iat * 1000 < Date.now() - 5 * 60 * 1000) {
      // Allow 5 minutes clock skew
      errors.push('ID token was issued too long ago');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Map OIDC claims to user profile based on attribute mapping
   */
  mapUserProfile(
    userInfo: OIDCUserInfo,
    claims: Record<string, unknown>,
    mapping: OIDCConfig['attributeMapping']
  ): {
    email: string;
    name?: string;
    picture?: string;
    groups?: string[];
  } {
    // Helper to get value by path
    const getValue = (obj: Record<string, unknown>, path: string): unknown => {
      return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
    };

    const email = (getValue(userInfo, mapping.email) || userInfo.email) as string;
    const name = mapping.name
      ? (getValue(userInfo, mapping.name) as string)
      : userInfo.name || `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim();
    const picture = mapping.picture
      ? (getValue(userInfo, mapping.picture) as string)
      : userInfo.picture;
    const groups = mapping.groups
      ? (getValue(userInfo, mapping.groups) as string[])
      : userInfo.groups;

    return {
      email,
      name: name || undefined,
      picture: picture || undefined,
      groups: groups || undefined,
    };
  }

  /**
   * Generate PKCE Code Verifier
   */
  generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('base64url');
  }

  /**
   * Generate PKCE Code Challenge
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Buffer.from(digest).toString('base64url');
  }

  /**
   * Generate State Parameter
   */
  generateState(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate Nonce
   */
  generateNonce(): string {
    return crypto.randomUUID();
  }
}

// ============================================
// OIDC Session Store (for state/nonce)
// ============================================

export class OIDCSessionStore {
  async createAuthRequest(request: OIDCAuthRequest): Promise<void> {
    const supabase = createServerClient();

    await supabase.from('oidc_auth_requests').insert({
      connection_id: request.connectionId,
      state: request.state,
      nonce: request.nonce,
      redirect_uri: request.redirectUri,
      code_verifier: request.codeVerifier,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    });
  }

  async getAuthRequest(state: string): Promise<OIDCAuthRequest | null> {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('oidc_auth_requests')
      .select('*')
      .eq('state', state)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (!data) return null;

    return {
      connectionId: data.connection_id,
      state: data.state,
      nonce: data.nonce,
      redirectUri: data.redirect_uri,
      codeVerifier: data.code_verifier,
    };
  }

  async deleteAuthRequest(state: string): Promise<void> {
    const supabase = createServerClient();
    await supabase
      .from('oidc_auth_requests')
      .delete()
      .eq('state', state);
  }
}

// ============================================
// Validation Helpers
// ============================================

export function validateOIDCConfig(config: OIDCConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.clientId) {
    errors.push('Client ID is required');
  }

  if (!config.clientSecret) {
    errors.push('Client Secret is required');
  }

  if (!config.issuerUrl) {
    errors.push('Issuer URL is required');
  } else if (!config.issuerUrl.startsWith('https://')) {
    errors.push('Issuer URL must use HTTPS');
  }

  if (!config.scopes || config.scopes.length === 0) {
    errors.push('At least one scope is required');
  } else if (!config.scopes.includes('openid')) {
    errors.push('openid scope is required for OIDC');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================
// Exports
// ============================================

export const oidcProvider = new OIDCProvider();
export const oidcSessionStore = new OIDCSessionStore();
