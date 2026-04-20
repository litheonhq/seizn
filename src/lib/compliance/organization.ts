import type { createServerClient } from '@/lib/supabase';

type Supabase = ReturnType<typeof createServerClient>;

function asId(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export async function resolveComplianceOrganizationId(
  supabase: Supabase,
  params: { userId: string; keyId?: string | null }
): Promise<string | null> {
  if (params.keyId) {
    const { data } = await supabase
      .from('api_keys')
      .select('organization_id')
      .eq('id', params.keyId)
      .maybeSingle();
    const orgId = asId((data as { organization_id?: unknown } | null)?.organization_id);
    if (orgId) return orgId;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', params.userId)
    .maybeSingle();
  const profileOrgId = asId((profile as { organization_id?: unknown } | null)?.organization_id);
  if (profileOrgId) return profileOrgId;

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', params.userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return asId((membership as { organization_id?: unknown } | null)?.organization_id);
}

export async function listOrganizationUserIds(
  supabase: Supabase,
  organizationId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId);

  if (error || !Array.isArray(data)) return [];
  return data
    .map((row) => asId((row as { user_id?: unknown }).user_id))
    .filter((id): id is string => id !== null);
}
