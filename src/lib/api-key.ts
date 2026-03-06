import { createHash, randomBytes } from 'crypto';

const API_KEY_PREFIX = 'szn_';

type BasicApiKeyScopeConfig = {
  level: 'user' | 'organization';
  organizationId?: string;
  actions: Array<'read' | 'write' | 'admin'>;
  customPermissions?: string[];
  deniedPermissions?: string[];
};

type BasicApiKeyInsertPayloadInput = {
  userId: string;
  name: string;
  hash: string;
  prefix: string;
  scopes: string[];
  organizationId?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
};

export function generateApiKey(): { key: string; hash: string; prefix: string } {
  // Generate 32 random bytes (256 bits)
  const randomPart = randomBytes(32).toString('base64url');
  const key = `${API_KEY_PREFIX}${randomPart}`;

  // Hash the key for storage
  const hash = hashApiKey(key);

  // Prefix for identification (first 8 chars after szn_)
  const prefix = key.substring(0, 12); // szn_ + 8 chars

  return { key, hash, prefix };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function validateApiKeyFormat(key: string): boolean {
  return key.startsWith(API_KEY_PREFIX) && key.length >= 40;
}

export function buildScopeConfigFromLegacyScopes(
  scopes: string[],
  organizationId?: string | null
): BasicApiKeyScopeConfig {
  const actionFlags = {
    read: false,
    write: false,
    admin: false,
  };
  const customPermissions = new Set<string>();

  const hasAdminScope = scopes.some((scope) =>
    [
      'settings:write',
      'api_key:create',
      'api_key:delete',
      'audit_log:view',
      'member:invite',
      'member:remove',
      'member:update_role',
      'team:update',
    ].includes(scope)
  );
  const hasWriteScope = scopes.some((scope) =>
    [
      'memory:write',
      'collection:create',
      'collection:update',
      'document:create',
      'document:update',
      'webhook:create',
      'webhook:update',
    ].includes(scope)
  );
  const hasReadScope = scopes.some((scope) =>
    [
      'memory:read',
      'memory:view',
      'memory:search',
      'collection:view',
      'collection:search',
      'document:view',
      'settings:view',
      'webhook:view',
    ].includes(scope)
  );

  if (hasAdminScope) {
    actionFlags.admin = true;
  }
  if (hasWriteScope || scopes.includes('memory:delete')) {
    actionFlags.write = true;
  }
  if (hasReadScope || (!actionFlags.read && !actionFlags.write && !actionFlags.admin)) {
    actionFlags.read = true;
  }

  if (scopes.includes('memory:delete') && !actionFlags.admin) {
    customPermissions.add('memory:delete');
  }

  const actions = (['read', 'write', 'admin'] as const).filter((action) => actionFlags[action]);

  const scopeConfig: BasicApiKeyScopeConfig = {
    level: organizationId ? 'organization' : 'user',
    actions,
  };

  if (organizationId) {
    scopeConfig.organizationId = organizationId;
  }

  if (customPermissions.size > 0) {
    scopeConfig.customPermissions = Array.from(customPermissions);
  }

  return scopeConfig;
}

export function buildBasicApiKeyInsertPayload(input: BasicApiKeyInsertPayloadInput) {
  return {
    user_id: input.userId,
    organization_id: input.organizationId || null,
    name: input.name,
    key_hash: input.hash,
    key_prefix: input.prefix,
    scopes: input.scopes,
    scope_config: buildScopeConfigFromLegacyScopes(input.scopes, input.organizationId),
    metadata: input.metadata || {},
    is_active: true,
    ...(input.expiresAt ? { expires_at: input.expiresAt } : {}),
  };
}
