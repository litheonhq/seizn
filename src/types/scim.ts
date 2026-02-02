/**
 * SCIM 2.0 Types for Enterprise User Provisioning
 *
 * RFC 7643 (Core Schema) and RFC 7644 (Protocol)
 * Supports user provisioning from IdPs like Okta, Azure AD, OneLogin, etc.
 */

// ============================================
// SCIM Schema URNs
// ============================================

export const SCIM_SCHEMAS = {
  USER: 'urn:ietf:params:scim:schemas:core:2.0:User',
  GROUP: 'urn:ietf:params:scim:schemas:core:2.0:Group',
  ENTERPRISE_USER: 'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User',
  LIST_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:ListResponse',
  PATCH_OP: 'urn:ietf:params:scim:api:messages:2.0:PatchOp',
  BULK_REQUEST: 'urn:ietf:params:scim:api:messages:2.0:BulkRequest',
  BULK_RESPONSE: 'urn:ietf:params:scim:api:messages:2.0:BulkResponse',
  ERROR: 'urn:ietf:params:scim:api:messages:2.0:Error',
  SERVICE_PROVIDER_CONFIG: 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig',
  RESOURCE_TYPE: 'urn:ietf:params:scim:schemas:core:2.0:ResourceType',
  SCHEMA: 'urn:ietf:params:scim:schemas:core:2.0:Schema',
} as const;

// ============================================
// Common SCIM Types
// ============================================

export interface SCIMMeta {
  resourceType: 'User' | 'Group' | 'Schema' | 'ResourceType' | 'ServiceProviderConfig';
  created: string;
  lastModified: string;
  location: string;
  version?: string;
}

export interface SCIMMultiValuedAttribute<T = string> {
  value: T;
  display?: string;
  type?: string;
  primary?: boolean;
  $ref?: string;
}

// ============================================
// SCIM User Resource (RFC 7643 Section 4.1)
// ============================================

export interface SCIMUserName {
  formatted?: string;
  familyName?: string;
  givenName?: string;
  middleName?: string;
  honorificPrefix?: string;
  honorificSuffix?: string;
}

export interface SCIMUserEmail {
  value: string;
  type?: 'work' | 'home' | 'other';
  primary?: boolean;
  display?: string;
}

export interface SCIMUserPhoneNumber {
  value: string;
  type?: 'work' | 'home' | 'mobile' | 'fax' | 'pager' | 'other';
  primary?: boolean;
}

export interface SCIMUserAddress {
  formatted?: string;
  streetAddress?: string;
  locality?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  type?: 'work' | 'home' | 'other';
  primary?: boolean;
}

export interface SCIMUserPhoto {
  value: string;
  type?: 'photo' | 'thumbnail';
  primary?: boolean;
}

export interface SCIMUserGroup {
  value: string;
  $ref?: string;
  display?: string;
  type?: 'direct' | 'indirect';
}

export interface SCIMEnterpriseUser {
  employeeNumber?: string;
  costCenter?: string;
  organization?: string;
  division?: string;
  department?: string;
  manager?: {
    value?: string;
    $ref?: string;
    displayName?: string;
  };
}

export interface SCIMUser {
  schemas: string[];
  id: string;
  externalId?: string;
  meta: SCIMMeta;

  // Core attributes
  userName: string;
  name?: SCIMUserName;
  displayName?: string;
  nickName?: string;
  profileUrl?: string;
  title?: string;
  userType?: string;
  preferredLanguage?: string;
  locale?: string;
  timezone?: string;
  active: boolean;

  // Multi-valued attributes
  emails?: SCIMUserEmail[];
  phoneNumbers?: SCIMUserPhoneNumber[];
  addresses?: SCIMUserAddress[];
  photos?: SCIMUserPhoto[];
  groups?: SCIMUserGroup[];

  // Enterprise extension
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'?: SCIMEnterpriseUser;
}

// ============================================
// SCIM Group Resource (RFC 7643 Section 4.2)
// ============================================

export interface SCIMGroupMember {
  value: string;
  $ref?: string;
  display?: string;
  type?: 'User' | 'Group';
}

export interface SCIMGroup {
  schemas: string[];
  id: string;
  externalId?: string;
  meta: SCIMMeta;
  displayName: string;
  members?: SCIMGroupMember[];
}

// ============================================
// SCIM Protocol Messages (RFC 7644)
// ============================================

export interface SCIMListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface SCIMPatchOperation {
  op: 'add' | 'remove' | 'replace';
  path?: string;
  value?: unknown;
}

export interface SCIMPatchRequest {
  schemas: string[];
  Operations: SCIMPatchOperation[];
}

export interface SCIMBulkOperation {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  bulkId?: string;
  version?: string;
  path: string;
  data?: Record<string, unknown>;
}

export interface SCIMBulkRequest {
  schemas: string[];
  Operations: SCIMBulkOperation[];
  failOnErrors?: number;
}

export interface SCIMBulkResponse {
  schemas: string[];
  Operations: Array<{
    method: string;
    bulkId?: string;
    version?: string;
    location?: string;
    status: string;
    response?: Record<string, unknown>;
  }>;
}

export interface SCIMError {
  schemas: string[];
  status: string;
  scimType?: SCIMErrorType;
  detail?: string;
}

export type SCIMErrorType =
  | 'invalidFilter'
  | 'tooMany'
  | 'uniqueness'
  | 'mutability'
  | 'invalidSyntax'
  | 'invalidPath'
  | 'noTarget'
  | 'invalidValue'
  | 'invalidVers'
  | 'sensitive';

// ============================================
// SCIM Discovery (RFC 7644 Section 4)
// ============================================

export interface SCIMServiceProviderConfigFeature {
  supported: boolean;
  maxOperations?: number;
  maxPayloadSize?: number;
}

export interface SCIMServiceProviderConfigAuthScheme {
  type: 'oauth2' | 'oauthbearertoken' | 'httpbasic';
  name: string;
  description?: string;
  specUri?: string;
  documentationUri?: string;
  primary?: boolean;
}

export interface SCIMServiceProviderConfig {
  schemas: string[];
  meta: SCIMMeta;
  documentationUri?: string;
  patch: SCIMServiceProviderConfigFeature;
  bulk: SCIMServiceProviderConfigFeature;
  filter: SCIMServiceProviderConfigFeature & {
    maxResults?: number;
  };
  changePassword: SCIMServiceProviderConfigFeature;
  sort: SCIMServiceProviderConfigFeature;
  etag: SCIMServiceProviderConfigFeature;
  authenticationSchemes: SCIMServiceProviderConfigAuthScheme[];
}

export interface SCIMSchemaAttribute {
  name: string;
  type: 'string' | 'boolean' | 'decimal' | 'integer' | 'dateTime' | 'binary' | 'reference' | 'complex';
  multiValued: boolean;
  description?: string;
  required: boolean;
  caseExact?: boolean;
  mutability: 'readOnly' | 'readWrite' | 'immutable' | 'writeOnly';
  returned: 'always' | 'never' | 'default' | 'request';
  uniqueness: 'none' | 'server' | 'global';
  canonicalValues?: string[];
  referenceTypes?: string[];
  subAttributes?: SCIMSchemaAttribute[];
}

export interface SCIMSchema {
  schemas: string[];
  id: string;
  name?: string;
  description?: string;
  attributes: SCIMSchemaAttribute[];
  meta: SCIMMeta;
}

export interface SCIMResourceType {
  schemas: string[];
  id: string;
  name: string;
  endpoint: string;
  description?: string;
  schema: string;
  schemaExtensions?: Array<{
    schema: string;
    required: boolean;
  }>;
  meta: SCIMMeta;
}

// ============================================
// SCIM Configuration
// ============================================

export interface SCIMProvisioningConfig {
  id: string;
  organizationId: string;
  enabled: boolean;
  bearerToken: string;
  tokenHash: string;
  baseUrl: string;

  // Feature toggles
  syncUsers: boolean;
  syncGroups: boolean;
  autoProvision: boolean;
  autoDeprovision: boolean;

  // Role mapping
  defaultRole: 'viewer' | 'member' | 'admin';
  groupRoleMapping?: Record<string, string>; // groupId -> role

  // Organization mapping (Group -> Org structure)
  groupToOrgMapping?: Record<string, string>; // groupId -> orgId

  // Audit
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
}

// ============================================
// SCIM Provisioning Events
// ============================================

export type SCIMProvisioningEventType =
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.deleted'
  | 'group.created'
  | 'group.updated'
  | 'group.deleted'
  | 'group.member.added'
  | 'group.member.removed';

export interface SCIMProvisioningEvent {
  id: string;
  configId: string;
  organizationId: string;
  eventType: SCIMProvisioningEventType;
  resourceType: 'User' | 'Group';
  resourceId: string;
  externalId?: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  status: 'success' | 'failed' | 'pending';
  errorMessage?: string;
  createdAt: string;
}

// ============================================
// Request/Response Types for API
// ============================================

export interface CreateSCIMUserRequest {
  schemas?: string[];
  externalId?: string;
  userName: string;
  name?: SCIMUserName;
  displayName?: string;
  nickName?: string;
  profileUrl?: string;
  title?: string;
  userType?: string;
  preferredLanguage?: string;
  locale?: string;
  timezone?: string;
  active?: boolean;
  emails?: SCIMUserEmail[];
  phoneNumbers?: SCIMUserPhoneNumber[];
  addresses?: SCIMUserAddress[];
  photos?: SCIMUserPhoto[];
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User'?: SCIMEnterpriseUser;
}

export interface UpdateSCIMUserRequest extends Partial<CreateSCIMUserRequest> {}

export interface CreateSCIMGroupRequest {
  schemas?: string[];
  externalId?: string;
  displayName: string;
  members?: SCIMGroupMember[];
}

export interface UpdateSCIMGroupRequest extends Partial<CreateSCIMGroupRequest> {}

// ============================================
// Filter Types
// ============================================

export interface SCIMFilterOptions {
  filter?: string;
  sortBy?: string;
  sortOrder?: 'ascending' | 'descending';
  startIndex?: number;
  count?: number;
  attributes?: string[];
  excludedAttributes?: string[];
}

// ============================================
// Database Models (for Supabase integration)
// ============================================

export interface SCIMUserDB {
  id: string;
  organization_id: string;
  scim_config_id: string;
  user_id?: string; // Link to profiles table
  external_id?: string;
  user_name: string;
  display_name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  active: boolean;
  raw_attributes: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SCIMGroupDB {
  id: string;
  organization_id: string;
  scim_config_id: string;
  external_id?: string;
  display_name: string;
  mapped_org_id?: string; // If group maps to a Seizn organization
  mapped_role?: string; // Role members of this group get
  created_at: string;
  updated_at: string;
}

export interface SCIMGroupMembershipDB {
  id: string;
  group_id: string;
  user_id: string;
  created_at: string;
}
