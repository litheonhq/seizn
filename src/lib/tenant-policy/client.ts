export interface FetchTenantPolicyOptions {
  includeBudget?: boolean;
  includeDegrade?: boolean;
  includePresets?: boolean;
}

export interface TenantPolicyFetchResult<T = unknown> {
  notModified: boolean;
  etag: string | null;
  data: T | null;
}

const tenantPolicyEtagCache = new Map<string, string>();

function buildTenantPolicyUrl(tenantId: string, options: FetchTenantPolicyOptions = {}): string {
  const params = new URLSearchParams({ tenant_id: tenantId });

  if (options.includeBudget) {
    params.set('include_budget', 'true');
  }

  if (options.includeDegrade) {
    params.set('include_degrade', 'true');
  }

  if (options.includePresets) {
    params.set('include_presets', 'true');
  }

  return `/api/tenant-policy?${params.toString()}`;
}

export async function fetchTenantPolicyWithCache<T = unknown>(
  tenantId: string,
  options: FetchTenantPolicyOptions = {}
): Promise<TenantPolicyFetchResult<T>> {
  const cachedEtag = tenantPolicyEtagCache.get(tenantId);

  const response = await fetch(buildTenantPolicyUrl(tenantId, options), {
    method: 'GET',
    headers: cachedEtag
      ? {
          'If-None-Match': cachedEtag,
        }
      : undefined,
    cache: 'no-store',
  });

  if (response.status === 304) {
    return {
      notModified: true,
      etag: cachedEtag ?? null,
      data: null,
    };
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch tenant policy (${response.status})`);
  }

  const etag = response.headers.get('etag');
  if (etag) {
    tenantPolicyEtagCache.set(tenantId, etag);
  }

  const data = (await response.json()) as T;

  return {
    notModified: false,
    etag,
    data,
  };
}

export function clearTenantPolicyClientCache(tenantId?: string): void {
  if (tenantId) {
    tenantPolicyEtagCache.delete(tenantId);
    return;
  }

  tenantPolicyEtagCache.clear();
}

export function getTenantPolicyCachedEtag(tenantId: string): string | undefined {
  return tenantPolicyEtagCache.get(tenantId);
}
