/**
 * Enterprise Features Types
 *
 * SSO, SCIM, and enterprise configuration types
 */

// SSO Types
export interface SSOConfig {
  id: string;
  orgId: string;
  enabled: boolean;
  provider: SSOProvider;
  config: SAMLConfig | OIDCConfig;
  domains: string[]; // Email domains that should use this SSO
  defaultRole: 'viewer' | 'editor' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export type SSOProvider = 'saml' | 'oidc' | 'okta' | 'azure-ad' | 'google-workspace' | 'onelogin';

export interface SAMLConfig {
  type: 'saml';
  entryPoint: string; // IdP SSO URL
  issuer: string; // SP Entity ID
  cert: string; // IdP Certificate (PEM)
  signatureAlgorithm: 'sha256' | 'sha512';
  digestAlgorithm: 'sha256' | 'sha512';
  wantAssertionsSigned: boolean;
  wantAuthnResponseSigned: boolean;
  nameIdFormat: 'emailAddress' | 'persistent' | 'transient';
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    groups?: string;
  };
}

export interface OIDCConfig {
  type: 'oidc';
  clientId: string;
  clientSecret: string;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
  jwksUri: string;
  scopes: string[];
  attributeMapping: {
    email: string;
    firstName: string;
    lastName: string;
    groups?: string;
  };
}

export interface SSOSession {
  id: string;
  userId: string;
  ssoConfigId: string;
  provider: SSOProvider;
  nameId: string;
  sessionIndex?: string;
  attributes: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

// SCIM Types
export interface SCIMConfig {
  id: string;
  orgId: string;
  enabled: boolean;
  bearerToken: string;
  baseUrl: string;
  syncUsers: boolean;
  syncGroups: boolean;
  autoProvision: boolean;
  autoDeprovision: boolean;
  defaultRole: 'viewer' | 'editor' | 'admin';
  createdAt: string;
  updatedAt: string;
}

export interface SCIMUser {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name: {
    givenName: string;
    familyName: string;
    formatted?: string;
  };
  displayName?: string;
  emails: Array<{
    value: string;
    type: 'work' | 'home' | 'other';
    primary: boolean;
  }>;
  active: boolean;
  groups?: Array<{
    value: string;
    display: string;
  }>;
  meta: {
    resourceType: 'User';
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface SCIMGroup {
  schemas: string[];
  id: string;
  externalId?: string;
  displayName: string;
  members?: Array<{
    value: string;
    display: string;
  }>;
  meta: {
    resourceType: 'Group';
    created: string;
    lastModified: string;
    location: string;
  };
}

export interface SCIMListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface SCIMError {
  schemas: string[];
  status: string;
  detail: string;
}

// Enterprise Settings
export interface EnterpriseConfig {
  id: string;
  orgId: string;
  plan: 'starter' | 'pro' | 'enterprise';
  features: EnterpriseFeatures;
  limits: EnterpriseLimits;
  billing: BillingInfo;
  createdAt: string;
  updatedAt: string;
}

export interface EnterpriseFeatures {
  sso: boolean;
  scim: boolean;
  auditLogs: boolean;
  customDomains: boolean;
  ipWhitelist: boolean;
  dataRetention: boolean;
  advancedAnalytics: boolean;
  dedicatedSupport: boolean;
  sla: boolean;
  customContracts: boolean;
}

export interface EnterpriseLimits {
  users: number;
  apiCalls: number;
  storage: number; // GB
  collections: number;
  documents: number;
  retentionDays: number;
}

export interface BillingInfo {
  plan: string;
  status: 'active' | 'past_due' | 'canceled';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  amount: number;
  currency: string;
}
