/**
 * SCIM Schemas and Discovery Responses
 *
 * RFC 7643 Section 7 - Schema Definition
 * RFC 7644 Section 4 - Service Provider Configuration
 */

import type {
  SCIMServiceProviderConfig,
  SCIMSchema,
  SCIMResourceType,
  SCIMSchemaAttribute,
} from '@/types/scim';
import { SCIM_SCHEMAS } from '@/types/scim';

// ============================================
// Service Provider Configuration
// ============================================

export function getServiceProviderConfig(baseUrl: string): SCIMServiceProviderConfig {
  const now = new Date().toISOString();

  return {
    schemas: [SCIM_SCHEMAS.SERVICE_PROVIDER_CONFIG],
    meta: {
      resourceType: 'ServiceProviderConfig',
      created: now,
      lastModified: now,
      location: `${baseUrl}/api/scim/v2/ServiceProviderConfig`,
    },
    documentationUri: 'https://docs.seizn.com/enterprise/scim',
    patch: {
      supported: true,
    },
    bulk: {
      supported: false,
      maxOperations: 0,
      maxPayloadSize: 0,
    },
    filter: {
      supported: true,
      maxResults: 200,
    },
    changePassword: {
      supported: false,
    },
    sort: {
      supported: true,
    },
    etag: {
      supported: false,
    },
    authenticationSchemes: [
      {
        type: 'oauthbearertoken',
        name: 'OAuth Bearer Token',
        description: 'Authentication scheme using the OAuth Bearer Token Standard',
        specUri: 'https://www.rfc-editor.org/info/rfc6750',
        documentationUri: 'https://docs.seizn.com/enterprise/scim#authentication',
        primary: true,
      },
    ],
  };
}

// ============================================
// Resource Types
// ============================================

export function getResourceTypes(baseUrl: string): SCIMResourceType[] {
  const now = new Date().toISOString();

  return [
    {
      schemas: [SCIM_SCHEMAS.RESOURCE_TYPE],
      id: 'User',
      name: 'User',
      endpoint: '/Users',
      description: 'User Account',
      schema: SCIM_SCHEMAS.USER,
      schemaExtensions: [
        {
          schema: SCIM_SCHEMAS.ENTERPRISE_USER,
          required: false,
        },
      ],
      meta: {
        resourceType: 'ResourceType',
        created: now,
        lastModified: now,
        location: `${baseUrl}/api/scim/v2/ResourceTypes/User`,
      },
    },
    {
      schemas: [SCIM_SCHEMAS.RESOURCE_TYPE],
      id: 'Group',
      name: 'Group',
      endpoint: '/Groups',
      description: 'Group',
      schema: SCIM_SCHEMAS.GROUP,
      meta: {
        resourceType: 'ResourceType',
        created: now,
        lastModified: now,
        location: `${baseUrl}/api/scim/v2/ResourceTypes/Group`,
      },
    },
  ];
}

// ============================================
// Schemas
// ============================================

export function getSchemas(baseUrl: string): SCIMSchema[] {
  return [
    getUserSchema(baseUrl),
    getGroupSchema(baseUrl),
    getEnterpriseUserSchema(baseUrl),
  ];
}

export function getUserSchema(baseUrl: string): SCIMSchema {
  const now = new Date().toISOString();

  return {
    schemas: [SCIM_SCHEMAS.SCHEMA],
    id: SCIM_SCHEMAS.USER,
    name: 'User',
    description: 'User Account',
    meta: {
      resourceType: 'Schema',
      created: now,
      lastModified: now,
      location: `${baseUrl}/api/scim/v2/Schemas/${encodeURIComponent(SCIM_SCHEMAS.USER)}`,
    },
    attributes: [
      createAttribute('userName', 'string', {
        description: 'Unique identifier for the User',
        required: true,
        uniqueness: 'server',
      }),
      createAttribute('name', 'complex', {
        description: 'The components of the user\'s name',
        subAttributes: [
          createAttribute('formatted', 'string', {
            description: 'The full name',
          }),
          createAttribute('familyName', 'string', {
            description: 'The family name',
          }),
          createAttribute('givenName', 'string', {
            description: 'The given name',
          }),
          createAttribute('middleName', 'string', {
            description: 'The middle name',
          }),
          createAttribute('honorificPrefix', 'string', {
            description: 'The honorific prefix',
          }),
          createAttribute('honorificSuffix', 'string', {
            description: 'The honorific suffix',
          }),
        ],
      }),
      createAttribute('displayName', 'string', {
        description: 'The name displayed for the user',
      }),
      createAttribute('nickName', 'string', {
        description: 'The casual name of the user',
      }),
      createAttribute('profileUrl', 'reference', {
        description: 'URL to the user\'s profile',
        referenceTypes: ['external'],
      }),
      createAttribute('title', 'string', {
        description: 'The user\'s title',
      }),
      createAttribute('userType', 'string', {
        description: 'The type of user',
      }),
      createAttribute('preferredLanguage', 'string', {
        description: 'User\'s preferred language',
      }),
      createAttribute('locale', 'string', {
        description: 'User\'s locale',
      }),
      createAttribute('timezone', 'string', {
        description: 'User\'s timezone',
      }),
      createAttribute('active', 'boolean', {
        description: 'Whether the user account is active',
        required: true,
      }),
      createAttribute('emails', 'complex', {
        description: 'Email addresses for the user',
        multiValued: true,
        subAttributes: [
          createAttribute('value', 'string', {
            description: 'Email address',
          }),
          createAttribute('type', 'string', {
            description: 'Email type',
            canonicalValues: ['work', 'home', 'other'],
          }),
          createAttribute('primary', 'boolean', {
            description: 'Whether this is the primary email',
          }),
        ],
      }),
      createAttribute('phoneNumbers', 'complex', {
        description: 'Phone numbers for the user',
        multiValued: true,
        subAttributes: [
          createAttribute('value', 'string', {
            description: 'Phone number',
          }),
          createAttribute('type', 'string', {
            description: 'Phone number type',
            canonicalValues: ['work', 'home', 'mobile', 'fax', 'pager', 'other'],
          }),
          createAttribute('primary', 'boolean', {
            description: 'Whether this is the primary phone',
          }),
        ],
      }),
      createAttribute('addresses', 'complex', {
        description: 'Addresses for the user',
        multiValued: true,
        subAttributes: [
          createAttribute('formatted', 'string', {
            description: 'Full address',
          }),
          createAttribute('streetAddress', 'string', {
            description: 'Street address',
          }),
          createAttribute('locality', 'string', {
            description: 'City or locality',
          }),
          createAttribute('region', 'string', {
            description: 'State or region',
          }),
          createAttribute('postalCode', 'string', {
            description: 'Postal code',
          }),
          createAttribute('country', 'string', {
            description: 'Country',
          }),
          createAttribute('type', 'string', {
            description: 'Address type',
            canonicalValues: ['work', 'home', 'other'],
          }),
          createAttribute('primary', 'boolean', {
            description: 'Whether this is the primary address',
          }),
        ],
      }),
      createAttribute('groups', 'complex', {
        description: 'Groups the user belongs to',
        multiValued: true,
        mutability: 'readOnly',
        subAttributes: [
          createAttribute('value', 'string', {
            description: 'Group ID',
            mutability: 'readOnly',
          }),
          createAttribute('$ref', 'reference', {
            description: 'Group URI',
            mutability: 'readOnly',
            referenceTypes: ['Group'],
          }),
          createAttribute('display', 'string', {
            description: 'Group display name',
            mutability: 'readOnly',
          }),
          createAttribute('type', 'string', {
            description: 'Membership type',
            mutability: 'readOnly',
            canonicalValues: ['direct', 'indirect'],
          }),
        ],
      }),
    ],
  };
}

export function getGroupSchema(baseUrl: string): SCIMSchema {
  const now = new Date().toISOString();

  return {
    schemas: [SCIM_SCHEMAS.SCHEMA],
    id: SCIM_SCHEMAS.GROUP,
    name: 'Group',
    description: 'Group',
    meta: {
      resourceType: 'Schema',
      created: now,
      lastModified: now,
      location: `${baseUrl}/api/scim/v2/Schemas/${encodeURIComponent(SCIM_SCHEMAS.GROUP)}`,
    },
    attributes: [
      createAttribute('displayName', 'string', {
        description: 'Display name for the group',
        required: true,
      }),
      createAttribute('members', 'complex', {
        description: 'Members of the group',
        multiValued: true,
        subAttributes: [
          createAttribute('value', 'string', {
            description: 'Member ID',
          }),
          createAttribute('$ref', 'reference', {
            description: 'Member URI',
            mutability: 'readOnly',
            referenceTypes: ['User', 'Group'],
          }),
          createAttribute('display', 'string', {
            description: 'Member display name',
            mutability: 'readOnly',
          }),
          createAttribute('type', 'string', {
            description: 'Member type',
            canonicalValues: ['User', 'Group'],
          }),
        ],
      }),
    ],
  };
}

export function getEnterpriseUserSchema(baseUrl: string): SCIMSchema {
  const now = new Date().toISOString();

  return {
    schemas: [SCIM_SCHEMAS.SCHEMA],
    id: SCIM_SCHEMAS.ENTERPRISE_USER,
    name: 'EnterpriseUser',
    description: 'Enterprise User Extension',
    meta: {
      resourceType: 'Schema',
      created: now,
      lastModified: now,
      location: `${baseUrl}/api/scim/v2/Schemas/${encodeURIComponent(SCIM_SCHEMAS.ENTERPRISE_USER)}`,
    },
    attributes: [
      createAttribute('employeeNumber', 'string', {
        description: 'Employee number',
      }),
      createAttribute('costCenter', 'string', {
        description: 'Cost center',
      }),
      createAttribute('organization', 'string', {
        description: 'Organization name',
      }),
      createAttribute('division', 'string', {
        description: 'Division name',
      }),
      createAttribute('department', 'string', {
        description: 'Department name',
      }),
      createAttribute('manager', 'complex', {
        description: 'Manager information',
        subAttributes: [
          createAttribute('value', 'string', {
            description: 'Manager user ID',
          }),
          createAttribute('$ref', 'reference', {
            description: 'Manager user URI',
            referenceTypes: ['User'],
          }),
          createAttribute('displayName', 'string', {
            description: 'Manager display name',
            mutability: 'readOnly',
          }),
        ],
      }),
    ],
  };
}

// ============================================
// Helper Functions
// ============================================

function createAttribute(
  name: string,
  type: SCIMSchemaAttribute['type'],
  options: Partial<Omit<SCIMSchemaAttribute, 'name' | 'type'>> = {}
): SCIMSchemaAttribute {
  return {
    name,
    type,
    multiValued: options.multiValued ?? false,
    description: options.description,
    required: options.required ?? false,
    caseExact: options.caseExact ?? false,
    mutability: options.mutability ?? 'readWrite',
    returned: options.returned ?? 'default',
    uniqueness: options.uniqueness ?? 'none',
    canonicalValues: options.canonicalValues,
    referenceTypes: options.referenceTypes,
    subAttributes: options.subAttributes,
  };
}
