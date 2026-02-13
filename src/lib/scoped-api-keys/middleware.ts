/**
 * Scoped API Key Middleware
 *
 * Middleware and helper functions for validating scoped API key permissions
 * in API routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Permission } from '../rbac/types';
import { extractApiKey, getDeprecationHeaders } from '../api-auth';
import {
  validateScopedApiKey,
  checkScopedPermission,
} from './validation';
import {
  ScopedApiKey,
  ActionPermissionMap,
  ScopedKeyValidationResult,
  ScopedPermissionCheckResult,
} from './types';

/**
 * Result of scoped API key authentication
 */
export interface ScopedAuthResult {
  success: true;
  userId: string;
  keyId: string;
  key: ScopedApiKey;
  orgId?: string;
  effectivePermissions: Permission[];
  rateLimitHeaders?: Record<string, string>;
  deprecationHeaders?: Record<string, string>;
}

export interface ScopedAuthError {
  success: false;
  error: {
    code: string;
    message: string;
    status: number;
    hint?: string;
  };
}

export type ScopedAuthResponse = ScopedAuthResult | ScopedAuthError;

/**
 * Error codes for scoped API key errors
 */
export const ScopedApiKeyErrorCodes = {
  MISSING_KEY: 'SCOPED_KEY_MISSING',
  INVALID_KEY: 'SCOPED_KEY_INVALID',
  EXPIRED_KEY: 'SCOPED_KEY_EXPIRED',
  IP_RESTRICTED: 'SCOPED_KEY_IP_RESTRICTED',
  SCOPE_MISMATCH: 'SCOPED_KEY_SCOPE_MISMATCH',
  PERMISSION_DENIED: 'SCOPED_KEY_PERMISSION_DENIED',
} as const;

/**
 * Authenticate a request using scoped API key
 */
export async function authenticateScopedRequest(
  request: NextRequest,
  options?: {
    /** Required permission for the operation */
    requiredPermission?: Permission;
    /** Resource context for scope validation */
    resourceContext?: {
      organizationId?: string;
      projectId?: string;
    };
  }
): Promise<ScopedAuthResponse> {
  // Extract API key from request
  const { apiKey, method: authMethod, isLegacy } = extractApiKey(request);

  if (!apiKey) {
    return {
      success: false,
      error: {
        code: ScopedApiKeyErrorCodes.MISSING_KEY,
        message: 'API key required. Use Authorization: Bearer <your-api-key> header.',
        status: 401,
        hint: 'Obtain an API key from your dashboard at https://www.seizn.com/dashboard/keys',
      },
    };
  }

  // Get client IP for restriction check
  const clientIp = getClientIp(request);

  // Validate the API key
  const validationResult = await validateScopedApiKey(apiKey, clientIp);

  if (!validationResult.valid) {
    // Determine specific error type
    if (validationResult.failureReason?.includes('IP')) {
      return {
        success: false,
        error: {
          code: ScopedApiKeyErrorCodes.IP_RESTRICTED,
          message: validationResult.failureReason,
          status: 403,
          hint: 'Your IP address is not allowed by this API key\'s restrictions',
        },
      };
    }

    if (validationResult.failureReason?.includes('expired')) {
      return {
        success: false,
        error: {
          code: ScopedApiKeyErrorCodes.EXPIRED_KEY,
          message: validationResult.failureReason,
          status: 401,
          hint: 'Generate a new API key from your dashboard',
        },
      };
    }

    return {
      success: false,
      error: {
        code: ScopedApiKeyErrorCodes.INVALID_KEY,
        message: validationResult.failureReason || 'Invalid API key',
        status: 401,
        hint: 'Check that your API key is correct and active',
      },
    };
  }

  const key = validationResult.key!;

  // Check scope constraints if resource context provided
  if (options?.resourceContext) {
    const scopeCheck = checkScopeConstraints(
      key,
      options.resourceContext.organizationId,
      options.resourceContext.projectId
    );

    if (!scopeCheck.allowed) {
      return {
        success: false,
        error: {
          code: ScopedApiKeyErrorCodes.SCOPE_MISMATCH,
          message: scopeCheck.reason,
          status: 403,
          hint: 'This API key is not authorized for this resource',
        },
      };
    }
  }

  // Check required permission if specified
  if (options?.requiredPermission) {
    const effectivePermissions = validationResult.effectivePermissions || [];

    if (!effectivePermissions.includes(options.requiredPermission)) {
      return {
        success: false,
        error: {
          code: ScopedApiKeyErrorCodes.PERMISSION_DENIED,
          message: `Permission '${options.requiredPermission}' is required for this operation`,
          status: 403,
          hint: `Your API key needs '${findRequiredActionLevel(options.requiredPermission)}' action level`,
        },
      };
    }
  }

  // Get deprecation headers for legacy auth method
  const deprecationHeaders = getDeprecationHeaders(authMethod);

  return {
    success: true,
    userId: validationResult.userId!,
    keyId: key.id,
    key,
    orgId: validationResult.orgId,
    effectivePermissions: validationResult.effectivePermissions || [],
    deprecationHeaders: Object.keys(deprecationHeaders).length > 0 ? deprecationHeaders : undefined,
  };
}

/**
 * Create an error response for scoped API key errors
 */
export function scopedAuthErrorResponse(error: ScopedAuthError['error']): NextResponse {
  const traceId = `trc_${crypto.randomUUID().replace(/-/g, '').substring(0, 24)}`;

  return NextResponse.json(
    {
      error: {
        error_code: error.code,
        message: error.message,
        trace_id: traceId,
        hint: error.hint,
        docs_url: 'https://www.seizn.com/docs/scoped-api-keys',
      },
    },
    {
      status: error.status,
      headers: {
        'X-Trace-ID': traceId,
      },
    }
  );
}

/**
 * Middleware wrapper for routes requiring scoped API key authentication
 */
export function withScopedApiKey(
  handler: (
    request: NextRequest,
    auth: ScopedAuthResult,
    ...args: unknown[]
  ) => Promise<NextResponse>,
  options?: {
    requiredPermission?: Permission;
  }
) {
  return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const authResult = await authenticateScopedRequest(request, {
      requiredPermission: options?.requiredPermission,
    });

    if (!authResult.success) {
      return scopedAuthErrorResponse(authResult.error);
    }

    // Add rate limit headers to response
    const response = await handler(request, authResult, ...args);

    if (authResult.rateLimitHeaders) {
      Object.entries(authResult.rateLimitHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    if (authResult.deprecationHeaders) {
      Object.entries(authResult.deprecationHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  };
}

/**
 * Check if a request has a specific permission
 */
export async function requireScopedPermission(
  request: NextRequest,
  permission: Permission,
  resourceContext?: {
    organizationId?: string;
    projectId?: string;
  }
): Promise<ScopedAuthResult> {
  const result = await authenticateScopedRequest(request, {
    requiredPermission: permission,
    resourceContext,
  });

  if (!result.success) {
    throw new ScopedPermissionError(result.error.message, result.error.code, result.error.status);
  }

  return result;
}

/**
 * Check multiple permissions (any)
 */
export async function requireAnyScopedPermission(
  request: NextRequest,
  permissions: Permission[],
  resourceContext?: {
    organizationId?: string;
    projectId?: string;
  }
): Promise<ScopedAuthResult> {
  const authResult = await authenticateScopedRequest(request, { resourceContext });

  if (!authResult.success) {
    throw new ScopedPermissionError(
      authResult.error.message,
      authResult.error.code,
      authResult.error.status
    );
  }

  const hasAny = permissions.some(p => authResult.effectivePermissions.includes(p));

  if (!hasAny) {
    throw new ScopedPermissionError(
      `One of these permissions is required: ${permissions.join(', ')}`,
      ScopedApiKeyErrorCodes.PERMISSION_DENIED,
      403
    );
  }

  return authResult;
}

/**
 * Check multiple permissions (all)
 */
export async function requireAllScopedPermissions(
  request: NextRequest,
  permissions: Permission[],
  resourceContext?: {
    organizationId?: string;
    projectId?: string;
  }
): Promise<ScopedAuthResult> {
  const authResult = await authenticateScopedRequest(request, { resourceContext });

  if (!authResult.success) {
    throw new ScopedPermissionError(
      authResult.error.message,
      authResult.error.code,
      authResult.error.status
    );
  }

  const missing = permissions.filter(p => !authResult.effectivePermissions.includes(p));

  if (missing.length > 0) {
    throw new ScopedPermissionError(
      `Missing required permissions: ${missing.join(', ')}`,
      ScopedApiKeyErrorCodes.PERMISSION_DENIED,
      403
    );
  }

  return authResult;
}

/**
 * Error class for scoped permission errors
 */
export class ScopedPermissionError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ScopedPermissionError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Get client IP from request
 */
function getClientIp(request: NextRequest): string | undefined {
  // Try various headers in order of reliability
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // Take the first IP in case of proxy chain
    return xForwardedFor.split(',')[0].trim();
  }

  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) {
    return xRealIp;
  }

  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return undefined;
}

/**
 * Check scope constraints for a key
 */
function checkScopeConstraints(
  key: ScopedApiKey,
  organizationId?: string,
  projectId?: string
): { allowed: boolean; reason: string } {
  const scope = key.scope;

  // User-level scope has no constraints
  if (scope.level === 'user') {
    return { allowed: true, reason: 'User-level scope' };
  }

  // Organization-level scope
  if (scope.level === 'organization') {
    if (organizationId && scope.organizationId !== organizationId) {
      return {
        allowed: false,
        reason: `API key is scoped to organization ${scope.organizationId}`,
      };
    }
    return { allowed: true, reason: 'Organization scope matched' };
  }

  // Project-level scope
  if (scope.level === 'project') {
    if (organizationId && scope.organizationId !== organizationId) {
      return {
        allowed: false,
        reason: `API key is scoped to organization ${scope.organizationId}`,
      };
    }
    if (projectId && !scope.projectIds?.includes(projectId)) {
      return {
        allowed: false,
        reason: `API key is not scoped to project ${projectId}`,
      };
    }
    return { allowed: true, reason: 'Project scope matched' };
  }

  return { allowed: false, reason: 'Unknown scope level' };
}

/**
 * Find required action level for a permission
 */
function findRequiredActionLevel(permission: Permission): string {
  if (ActionPermissionMap.read.includes(permission)) {
    return 'read';
  }
  if (ActionPermissionMap.write.includes(permission)) {
    return 'write';
  }
  return 'admin';
}
