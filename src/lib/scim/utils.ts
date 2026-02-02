/**
 * SCIM Utilities
 *
 * Helper functions for SCIM filter parsing, response building, etc.
 */

import { randomBytes, createHash } from 'crypto';
import type {
  SCIMError,
  SCIMListResponse,
  SCIMPatchOperation,
  SCIMErrorType,
  SCIMFilterOptions,
  SCIMUser,
  SCIMGroup,
} from '@/types/scim';
import { SCIM_SCHEMAS } from '@/types/scim';

// ============================================
// Error Response Builders
// ============================================

export function createSCIMError(
  status: number,
  detail: string,
  scimType?: SCIMErrorType
): SCIMError {
  return {
    schemas: [SCIM_SCHEMAS.ERROR],
    status: String(status),
    detail,
    ...(scimType && { scimType }),
  };
}

export function createNotFoundError(resourceType: string, id: string): SCIMError {
  return createSCIMError(404, `${resourceType} with id '${id}' not found`, 'noTarget');
}

export function createConflictError(detail: string): SCIMError {
  return createSCIMError(409, detail, 'uniqueness');
}

export function createBadRequestError(detail: string, scimType?: SCIMErrorType): SCIMError {
  return createSCIMError(400, detail, scimType || 'invalidSyntax');
}

export function createUnauthorizedError(): SCIMError {
  return createSCIMError(401, 'Invalid or missing authentication token');
}

export function createForbiddenError(): SCIMError {
  return createSCIMError(403, 'Access denied to this resource');
}

// ============================================
// List Response Builder
// ============================================

export function createListResponse<T>(
  resources: T[],
  totalResults: number,
  startIndex: number = 1,
  count?: number
): SCIMListResponse<T> {
  return {
    schemas: [SCIM_SCHEMAS.LIST_RESPONSE],
    totalResults,
    startIndex,
    itemsPerPage: resources.length,
    Resources: resources,
  };
}

// ============================================
// Token Generation
// ============================================

export function generateSCIMToken(): string {
  // Generate a secure random token (32 bytes = 256 bits)
  const token = randomBytes(32).toString('base64url');
  return `scim_${token}`;
}

export function hashSCIMToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ============================================
// Filter Parsing (RFC 7644 Section 3.4.2.2)
// ============================================

export interface ParsedFilter {
  attribute: string;
  operator: SCIMFilterOperator;
  value: string;
}

export type SCIMFilterOperator = 'eq' | 'ne' | 'co' | 'sw' | 'ew' | 'pr' | 'gt' | 'ge' | 'lt' | 'le';

/**
 * Parse a simple SCIM filter expression
 * Supports: eq, ne, co, sw, ew, pr, gt, ge, lt, le
 *
 * Examples:
 * - userName eq "john@example.com"
 * - active eq true
 * - name.familyName co "ski"
 */
export function parseFilter(filter: string): ParsedFilter | null {
  if (!filter) return null;

  // Match attribute operator value pattern
  // e.g., userName eq "john@example.com"
  const quotedMatch = filter.match(/^(\S+)\s+(eq|ne|co|sw|ew|gt|ge|lt|le)\s+"([^"]*)"\s*$/i);
  if (quotedMatch) {
    return {
      attribute: quotedMatch[1].toLowerCase(),
      operator: quotedMatch[2].toLowerCase() as SCIMFilterOperator,
      value: quotedMatch[3],
    };
  }

  // Match boolean/number patterns (no quotes)
  // e.g., active eq true
  const unquotedMatch = filter.match(/^(\S+)\s+(eq|ne|gt|ge|lt|le)\s+(\S+)\s*$/i);
  if (unquotedMatch) {
    return {
      attribute: unquotedMatch[1].toLowerCase(),
      operator: unquotedMatch[2].toLowerCase() as SCIMFilterOperator,
      value: unquotedMatch[3],
    };
  }

  // Match presence filter
  // e.g., userName pr
  const presenceMatch = filter.match(/^(\S+)\s+pr\s*$/i);
  if (presenceMatch) {
    return {
      attribute: presenceMatch[1].toLowerCase(),
      operator: 'pr',
      value: '',
    };
  }

  return null;
}

/**
 * Apply filter to a resource
 */
export function matchesFilter<T extends Record<string, unknown>>(
  resource: T,
  filter: ParsedFilter
): boolean {
  const { attribute, operator, value } = filter;

  // Get attribute value, supporting dot notation (e.g., name.familyName)
  const attrValue = getNestedValue(resource, attribute);

  if (operator === 'pr') {
    return attrValue !== undefined && attrValue !== null && attrValue !== '';
  }

  // Handle null/undefined
  if (attrValue === undefined || attrValue === null) {
    return operator === 'ne';
  }

  // Convert to string for comparison
  const strValue = String(attrValue).toLowerCase();
  const filterValue = value.toLowerCase();

  switch (operator) {
    case 'eq':
      return strValue === filterValue;
    case 'ne':
      return strValue !== filterValue;
    case 'co':
      return strValue.includes(filterValue);
    case 'sw':
      return strValue.startsWith(filterValue);
    case 'ew':
      return strValue.endsWith(filterValue);
    case 'gt':
      return strValue > filterValue;
    case 'ge':
      return strValue >= filterValue;
    case 'lt':
      return strValue < filterValue;
    case 'le':
      return strValue <= filterValue;
    default:
      return true;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue<T extends Record<string, unknown>>(
  obj: T,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

// ============================================
// Patch Operation Processing
// ============================================

/**
 * Apply SCIM PATCH operations to a resource
 */
export function applyPatchOperations<T extends Record<string, unknown>>(
  resource: T,
  operations: SCIMPatchOperation[]
): T {
  const result = { ...resource };

  for (const op of operations) {
    applyPatchOperation(result, op);
  }

  return result;
}

function applyPatchOperation<T extends Record<string, unknown>>(
  resource: T,
  operation: SCIMPatchOperation
): void {
  const { op, path, value } = operation;

  if (!path) {
    // No path means operation applies to root
    if (op === 'add' || op === 'replace') {
      if (typeof value === 'object' && value !== null) {
        Object.assign(resource, value);
      }
    }
    return;
  }

  const pathParts = path.split('.');
  const lastPart = pathParts.pop()!;

  // Navigate to the parent object
  let current: Record<string, unknown> = resource;
  for (const part of pathParts) {
    if (!current[part] || typeof current[part] !== 'object') {
      if (op === 'add') {
        current[part] = {};
      } else {
        return; // Can't navigate to non-existent path for replace/remove
      }
    }
    current = current[part] as Record<string, unknown>;
  }

  switch (op) {
    case 'add':
      if (Array.isArray(current[lastPart])) {
        (current[lastPart] as unknown[]).push(value);
      } else {
        current[lastPart] = value;
      }
      break;
    case 'replace':
      current[lastPart] = value;
      break;
    case 'remove':
      delete current[lastPart];
      break;
  }
}

// ============================================
// Attribute Extraction
// ============================================

/**
 * Extract primary email from SCIM user
 */
export function extractPrimaryEmail(user: SCIMUser): string | undefined {
  if (!user.emails || user.emails.length === 0) {
    return undefined;
  }

  const primaryEmail = user.emails.find((e) => e.primary);
  if (primaryEmail) {
    return primaryEmail.value;
  }

  // Fall back to first work email, then first email
  const workEmail = user.emails.find((e) => e.type === 'work');
  return workEmail?.value || user.emails[0]?.value;
}

/**
 * Build display name from SCIM user name components
 */
export function buildDisplayName(user: SCIMUser): string {
  if (user.displayName) {
    return user.displayName;
  }

  if (user.name?.formatted) {
    return user.name.formatted;
  }

  if (user.name?.givenName && user.name?.familyName) {
    return `${user.name.givenName} ${user.name.familyName}`;
  }

  return user.userName;
}

// ============================================
// URL Building
// ============================================

export function buildSCIMResourceUrl(baseUrl: string, resourceType: string, id: string): string {
  return `${baseUrl}/api/scim/v2/${resourceType}/${id}`;
}

export function buildSCIMSchemaUrl(baseUrl: string, schemaId: string): string {
  return `${baseUrl}/api/scim/v2/Schemas/${encodeURIComponent(schemaId)}`;
}

// ============================================
// Pagination
// ============================================

export function paginateResources<T>(
  resources: T[],
  options: SCIMFilterOptions
): { resources: T[]; total: number } {
  const { startIndex = 1, count = 100 } = options;

  // SCIM uses 1-based indexing
  const startIdx = Math.max(0, startIndex - 1);
  const endIdx = startIdx + count;

  return {
    resources: resources.slice(startIdx, endIdx),
    total: resources.length,
  };
}

// ============================================
// Validation
// ============================================

export function validateUserName(userName: string): boolean {
  // RFC 7643 recommends userName be unique and typically an email or login
  if (!userName || userName.trim().length === 0) {
    return false;
  }

  // Basic length check
  if (userName.length > 256) {
    return false;
  }

  return true;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
