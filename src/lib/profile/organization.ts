import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

type ProfileIdentity = {
  userId?: string | null;
  email?: string | null;
  organizationId?: string | null;
};

type MembershipRow = {
  organization_id?: string | null;
  role?: string | null;
  created_at?: string | null;
};

function isMissingRowError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';

  return (
    code === 'PGRST116' ||
    message.includes('0 rows') ||
    message.includes('multiple (or no) rows returned')
  );
}

function getRolePriority(role: string | null | undefined): number {
  switch ((role || '').toLowerCase()) {
    case 'owner':
      return 0;
    case 'admin':
      return 1;
    case 'member':
      return 2;
    case 'viewer':
      return 3;
    default:
      return 99;
  }
}

function pickDefaultOrganizationId(memberships: MembershipRow[]): string | null {
  const candidates = memberships
    .filter(
      (membership): membership is MembershipRow & { organization_id: string } =>
        typeof membership.organization_id === 'string' && membership.organization_id.trim().length > 0
    )
    .sort((left, right) => {
      const roleDelta = getRolePriority(left.role) - getRolePriority(right.role);
      if (roleDelta !== 0) {
        return roleDelta;
      }

      const leftCreated = left.created_at ? Date.parse(left.created_at) : Number.POSITIVE_INFINITY;
      const rightCreated = right.created_at ? Date.parse(right.created_at) : Number.POSITIVE_INFINITY;
      if (leftCreated !== rightCreated) {
        return leftCreated - rightCreated;
      }

      return left.organization_id.localeCompare(right.organization_id);
    });

  return candidates[0]?.organization_id ?? null;
}

export async function resolveSessionOrganizationId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  identity: ProfileIdentity
): Promise<string | null> {
  const providedOrganizationId = identity.organizationId?.trim() || null;
  if (providedOrganizationId) {
    return providedOrganizationId;
  }

  let resolvedUserId = identity.userId?.trim() || null;
  const email = identity.email?.trim().toLowerCase() || null;

  if (resolvedUserId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', resolvedUserId)
      .single();

    if (data?.id) {
      resolvedUserId = String(data.id);

      if (typeof data.organization_id === 'string' && data.organization_id.trim()) {
        return data.organization_id;
      }
    }

    if (error && !isMissingRowError(error)) {
      return null;
    }
  }

  if (email) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('email', email)
      .single();

    if (data?.id) {
      resolvedUserId = String(data.id);

      if (typeof data.organization_id === 'string' && data.organization_id.trim()) {
        return data.organization_id;
      }
    }

    if (error && !isMissingRowError(error)) {
      return null;
    }
  }

  if (!resolvedUserId) {
    return null;
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id, role, created_at')
    .eq('user_id', resolvedUserId);

  if (membershipError || !Array.isArray(memberships)) {
    return null;
  }

  return pickDefaultOrganizationId(memberships);
}

export async function normalizeSessionOrganizationId(
  identity: ProfileIdentity
): Promise<string | null> {
  const providedOrganizationId = identity.organizationId?.trim() || null;
  if (providedOrganizationId) {
    return providedOrganizationId;
  }

  if (!identity.userId?.trim() && !identity.email?.trim()) {
    return null;
  }

  if (!hasServerSupabaseServiceRoleConfig()) {
    return null;
  }

  return resolveSessionOrganizationId(createServerClient(), identity);
}
