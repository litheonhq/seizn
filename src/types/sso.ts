/**
 * SSO/SAML Types for Enterprise Authentication
 *
 * Types for managing SSO configurations, SAML providers,
 * and enterprise authentication flows.
 */

// ============================================
// Enums
// ============================================

export type SSOProviderType = 'saml' | 'oidc';
export type SSOConnectionStatus = 'draft' | 'testing' | 'active' | 'disabled';
export type SSODomainVerificationMethod = 'dns_txt' | 'dns_cname' | 'meta_tag' | 'file';

// ============================================
// SAML Configuration
// ============================================

export interface SAMLConfig {
  /** IdP Entity ID (e.g., https://idp.example.com/saml) */
  entityId: string;
  /** IdP SSO URL for redirecting users */
  ssoUrl: string;
  /** IdP Single Logout URL (optional) */
  sloUrl?: string;
  /** IdP X.509 Certificate in PEM format */
  certificate: string;
}

export interface OIDCConfig {
  /** OIDC Issuer URL */
  issuer: string;
  /** OIDC Client ID */
  clientId: string;
  /** OIDC Client Secret (should be encrypted in storage) */
  clientSecret?: string;
}

// ============================================
// Attribute Mapping
// ============================================

export interface SSOAttributeMapping {
  /** IdP attribute for email (required) */
  email: string;
  /** IdP attribute for first name */
  firstName?: string;
  /** IdP attribute for last name */
  lastName?: string;
  /** IdP attribute for display name */
  displayName?: string;
  /** IdP attribute for groups/roles */
  groups?: string;
  /** Custom attribute mappings */
  [key: string]: string | undefined;
}

// ============================================
// SSO Settings
// ============================================

export interface SSOSettings {
  /** Allow IdP-initiated SSO (not just SP-initiated) */
  allowIdpInitiated: boolean;
  /** Force re-authentication on each login */
  forceAuthn: boolean;
  /** Sign the SAML AuthnRequest */
  signRequest: boolean;
  /** Require signed assertions from IdP */
  wantAssertionsSigned: boolean;
  /** SAML NameID format */
  nameIdFormat: string;
  /** SAML AuthnContext class reference */
  authnContextClassRef: string;
  /** Default role for new users provisioned via SSO */
  defaultRole: 'member' | 'admin';
  /** Enable auto-provisioning of new users */
  autoProvision: boolean;
  /** Enable Just-In-Time (JIT) provisioning */
  jitProvisioning: boolean;
}

export const DEFAULT_SSO_SETTINGS: SSOSettings = {
  allowIdpInitiated: true,
  forceAuthn: false,
  signRequest: true,
  wantAssertionsSigned: true,
  nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  authnContextClassRef: 'urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport',
  defaultRole: 'member',
  autoProvision: true,
  jitProvisioning: true,
};

export const DEFAULT_ATTRIBUTE_MAPPING: SSOAttributeMapping = {
  email: 'email',
  firstName: 'first_name',
  lastName: 'last_name',
  displayName: 'display_name',
  groups: 'groups',
};

// ============================================
// SSO Connection
// ============================================

export interface SSOConnection {
  id: string;
  organizationId: string;
  name: string;
  providerType: SSOProviderType;
  status: SSOConnectionStatus;

  // SAML Config (nullable for draft)
  entityId?: string;
  ssoUrl?: string;
  sloUrl?: string;
  certificate?: string;

  // OIDC Config (alternative)
  oidcIssuer?: string;
  oidcClientId?: string;

  // SP Config (auto-generated)
  spEntityId: string;
  spAcsUrl: string;
  spMetadataUrl: string;

  // Domain mapping
  emailDomains: string[];

  // Mappings and settings
  attributeMapping: SSOAttributeMapping;
  settings: SSOSettings;

  // Audit
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastUsedAt?: string;
}

// ============================================
// Domain Verification
// ============================================

export interface SSODomainVerification {
  id: string;
  organizationId: string;
  domain: string;
  verificationMethod: SSODomainVerificationMethod;
  verificationToken: string;
  isVerified: boolean;
  verifiedAt?: string;
  expiresAt: string;
  createdAt: string;
}

// ============================================
// SSO Session
// ============================================

export interface SSOSession {
  id: string;
  connectionId: string;
  userId: string;
  sessionIndex?: string;
  nameId: string;
  nameIdFormat?: string;
  idpSessionNotOnOrAfter?: string;
  attributes: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

// ============================================
// SSO Login Attempt
// ============================================

export interface SSOLoginAttempt {
  id: string;
  connectionId?: string;
  organizationId?: string;
  requestId?: string;
  relayState?: string;
  responseStatus: 'success' | 'error' | 'pending';
  errorCode?: string;
  errorMessage?: string;
  userId?: string;
  email?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateSSOConnectionRequest {
  name: string;
  providerType?: SSOProviderType;
}

export interface UpdateSSOConnectionRequest {
  name?: string;
  status?: SSOConnectionStatus;

  // SAML Config
  entityId?: string;
  ssoUrl?: string;
  sloUrl?: string;
  certificate?: string;

  // OIDC Config
  oidcIssuer?: string;
  oidcClientId?: string;
  oidcClientSecret?: string;

  // Domain mapping
  emailDomains?: string[];

  // Mappings and settings
  attributeMapping?: Partial<SSOAttributeMapping>;
  settings?: Partial<SSOSettings>;
}

export interface SSOConnectionResponse {
  success: boolean;
  connection: SSOConnection;
}

export interface SSOConnectionListResponse {
  success: boolean;
  connections: SSOConnection[];
  count: number;
}

export interface StartDomainVerificationRequest {
  domain: string;
  method?: SSODomainVerificationMethod;
}

export interface DomainVerificationResponse {
  success: boolean;
  verification: SSODomainVerification;
  instructions: string;
}

export interface VerifyDomainRequest {
  verificationId: string;
}

export interface TestSSOConnectionRequest {
  connectionId: string;
}

export interface TestSSOConnectionResponse {
  success: boolean;
  testPassed: boolean;
  errors?: string[];
  metadata?: {
    idpEntityId?: string;
    idpSsoUrl?: string;
    certificateValid?: boolean;
    certificateExpiry?: string;
  };
}

// ============================================
// SAML Specific Types
// ============================================

export interface SAMLServiceProviderMetadata {
  entityId: string;
  acsUrl: string;
  sloUrl?: string;
  certificate?: string;
  nameIdFormat: string;
  wantAuthnRequestsSigned: boolean;
  wantAssertionsSigned: boolean;
}

export interface SAMLAuthRequest {
  id: string;
  issuer: string;
  destination: string;
  assertionConsumerServiceURL: string;
  nameIdPolicy: {
    format: string;
    allowCreate: boolean;
  };
  requestedAuthnContext?: {
    comparison: string;
    authnContextClassRef: string[];
  };
  forceAuthn: boolean;
  isPassive: boolean;
}

export interface SAMLAssertion {
  issuer: string;
  subject: {
    nameId: string;
    nameIdFormat: string;
    confirmationMethod: string;
    confirmationData?: {
      notOnOrAfter: string;
      recipient: string;
      inResponseTo: string;
    };
  };
  conditions: {
    notBefore: string;
    notOnOrAfter: string;
    audienceRestriction: string[];
  };
  authnStatement: {
    authnInstant: string;
    sessionIndex?: string;
    sessionNotOnOrAfter?: string;
    authnContext: {
      authnContextClassRef: string;
    };
  };
  attributeStatement: Record<string, string | string[]>;
}

export interface SAMLResponse {
  id: string;
  inResponseTo: string;
  destination: string;
  issuer: string;
  status: {
    code: string;
    message?: string;
  };
  assertion?: SAMLAssertion;
}

// ============================================
// Error Types
// ============================================

export type SSOErrorCode =
  | 'SSO_NOT_CONFIGURED'
  | 'SSO_DISABLED'
  | 'DOMAIN_NOT_VERIFIED'
  | 'INVALID_SAML_RESPONSE'
  | 'CERTIFICATE_EXPIRED'
  | 'CERTIFICATE_INVALID'
  | 'SIGNATURE_INVALID'
  | 'ASSERTION_EXPIRED'
  | 'USER_NOT_FOUND'
  | 'USER_PROVISIONING_FAILED'
  | 'ATTRIBUTE_MAPPING_FAILED';

export interface SSOError {
  code: SSOErrorCode;
  message: string;
  details?: Record<string, unknown>;
}
