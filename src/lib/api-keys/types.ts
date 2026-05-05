export type ApiKeyAuditAction =
  | 'created'
  | 'revoked'
  | 'rotated'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'scope_denied';

export type ApiKeyTool =
  | 'recall'
  | 'check'
  | 'remember'
  | 'search'
  | 'timeline'
  | 'graph'
  | 'projects'
  | string;

export type ApiKeyPeriod = 'day' | 'month';

export type ApiKeyRecord = {
  id: string;
  user_id: string;
  org_id?: string | null;
  organization_id?: string | null;
  scopes: string[];
  prefix?: string | null;
  key_prefix?: string | null;
  hash?: string | null;
  key_hash?: string | null;
  rate_limit_per_minute: number;
  monthly_quota: number;
  monthly_quota_period: ApiKeyPeriod;
  revoked_at?: string | null;
  is_active?: boolean | null;
};

export type ValidatedApiKey = {
  apiKeyId: string;
  userId: string;
  orgId: string | null;
  scopes: string[];
  rateLimitPerMinute: number;
  monthlyQuota: number;
  monthlyQuotaPeriod: ApiKeyPeriod;
};

export type SupabaseLike = {
  // Supabase's fluent builders vary per table; tests inject the small subset each path needs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
};

export type RedisLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, options?: Record<string, unknown>): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
};
