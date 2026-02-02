/**
 * Scoped API Keys Module
 *
 * Provides fine-grained access control for API keys:
 * - Organization/project scoping
 * - Action-based permissions (read, write, admin)
 * - IP range restrictions
 *
 * @example
 * ```typescript
 * import {
 *   validateScopedApiKey,
 *   checkScopedPermission,
 *   withScopedApiKey,
 *   requireScopedPermission,
 * } from '@/lib/scoped-api-keys';
 *
 * // Validate a key with IP check
 * const result = await validateScopedApiKey(apiKey, clientIp);
 * if (result.valid) {
 *   console.log('Effective permissions:', result.effectivePermissions);
 * }
 *
 * // Check specific permission
 * const permCheck = await checkScopedPermission({
 *   keyId: 'key-123',
 *   permission: 'memory:create',
 *   resourceContext: { organizationId: 'org-456' },
 *   clientIp: '192.168.1.100',
 * });
 *
 * // Use middleware in API route
 * export const GET = withScopedApiKey(
 *   async (request, auth) => {
 *     // auth contains userId, keyId, effectivePermissions, etc.
 *     return NextResponse.json({ data: 'protected' });
 *   },
 *   { requiredPermission: 'memory:view' }
 * );
 *
 * // Or use requireScopedPermission in handler
 * export async function POST(request: NextRequest) {
 *   const auth = await requireScopedPermission(request, 'memory:create');
 *   // ... rest of handler
 * }
 * ```
 */

export * from './types';
export * from './validation';
export * from './service';
export * from './middleware';
