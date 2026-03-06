import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { resolveProfileUserId } from './resolve';
import { upsertProfileWithFallback } from './upsert';

type ProfileIdentity = {
  userId?: string | null;
  email?: string | null;
  organizationId?: string | null;
  organizationSelection?: 'personal' | 'organization' | null;
};

type MembershipRow = {
  organization_id?: string | null;
  role?: string | null;
  created_at?: string | null;
};

type PgProfileOrganizationState = {
  profileId: string | null;
  organizationId: string | null;
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

function isMissingProfileOrganizationColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';

  return (
    (code === 'PGRST204' || code === '42703') &&
    message.includes('organization_id')
  );
}

function getPostgresConnectionString(): string | null {
  return process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || null;
}

function pgConfigFromConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  const database = url.pathname?.replace(/^\//, '') || undefined;

  return {
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
    host: url.hostname,
    port: url.port ? Number(url.port) : undefined,
    database,
  };
}

async function withPgClient<T>(
  handler: (client: import('pg').Client) => Promise<T>
): Promise<T | null> {
  const connectionString = getPostgresConnectionString();
  if (!connectionString) {
    return null;
  }

  const pg = await import('pg');
  const client = new pg.Client({
    ...pgConfigFromConnectionString(connectionString),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    return await handler(client);
  } finally {
    await client.end();
  }
}

async function readProfileOrganizationStateViaPg(
  identity: ProfileIdentity
): Promise<PgProfileOrganizationState | null> {
  try {
    return await withPgClient(async (client) => {
      const userId = identity.userId?.trim() || null;
      const email = identity.email?.trim().toLowerCase() || null;

      if (userId) {
        const { rows } = await client.query(
          `
            SELECT id::text AS id, organization_id::text AS organization_id
            FROM public.profiles
            WHERE id::text = $1
            LIMIT 1;
          `,
          [userId]
        );

        if (rows[0]) {
          return {
            profileId: rows[0].id ?? null,
            organizationId: rows[0].organization_id ?? null,
          };
        }
      }

      if (email) {
        const { rows } = await client.query(
          `
            SELECT id::text AS id, organization_id::text AS organization_id
            FROM public.profiles
            WHERE lower(email) = $1
            LIMIT 1;
          `,
          [email]
        );

        if (rows[0]) {
          return {
            profileId: rows[0].id ?? null,
            organizationId: rows[0].organization_id ?? null,
          };
        }
      }

      return {
        profileId: null,
        organizationId: null,
      };
    });
  } catch (error) {
    if (isMissingProfileOrganizationColumnError(error)) {
      return {
        profileId: identity.userId?.trim() || null,
        organizationId: null,
      };
    }

    throw error;
  }
}

async function updateProfileOrganizationIdViaPg(
  profileId: string,
  organizationId: string | null
): Promise<boolean> {
  let updated: boolean | null;

  try {
    updated = await withPgClient(async (client) => {
      const { rowCount } = await client.query(
        `
          UPDATE public.profiles
          SET organization_id = $2::uuid
          WHERE id::text = $1;
        `,
        [profileId, organizationId]
      );

      return Boolean(rowCount);
    });
  } catch (error) {
    if (isMissingProfileOrganizationColumnError(error)) {
      return false;
    }

    throw error;
  }

  return updated === true;
}

async function ensureProfileExists(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  identity: ProfileIdentity,
  profileId: string | null
): Promise<string | null> {
  const targetProfileId = profileId || identity.userId?.trim() || null;
  if (!targetProfileId) {
    return null;
  }

  const result = await upsertProfileWithFallback(
    supabase,
    targetProfileId,
    identity.email?.trim().toLowerCase() || null
  );

  if (!result.ok) {
    return null;
  }

  return targetProfileId;
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
  if (identity.organizationSelection === 'personal') {
    return null;
  }

  const providedOrganizationId = identity.organizationId?.trim() || null;
  if (providedOrganizationId) {
    return providedOrganizationId;
  }

  let resolvedUserId = identity.userId?.trim() || null;
  const email = identity.email?.trim().toLowerCase() || null;
  let profileOrganizationId: string | null = null;

  if (resolvedUserId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', resolvedUserId)
      .single();

    if (data?.id) {
      resolvedUserId = String(data.id);

      if (typeof data.organization_id === 'string' && data.organization_id.trim()) {
        profileOrganizationId = data.organization_id;
      }
    }

    if (isMissingProfileOrganizationColumnError(error)) {
      const fallbackState = await readProfileOrganizationStateViaPg({
        userId: resolvedUserId,
        email,
      });

      if (fallbackState?.profileId) {
        resolvedUserId = fallbackState.profileId;
        profileOrganizationId = fallbackState.organizationId;
      }
    }

    if (error && !isMissingRowError(error)) {
      if (!isMissingProfileOrganizationColumnError(error)) {
        return null;
      }
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
        profileOrganizationId = data.organization_id;
      }
    }

    if (isMissingProfileOrganizationColumnError(error)) {
      const fallbackState = await readProfileOrganizationStateViaPg({
        userId: resolvedUserId,
        email,
      });

      if (fallbackState?.profileId) {
        resolvedUserId = fallbackState.profileId;
        profileOrganizationId = fallbackState.organizationId;
      }
    }

    if (error && !isMissingRowError(error)) {
      if (!isMissingProfileOrganizationColumnError(error)) {
        return null;
      }
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
    return profileOrganizationId;
  }

  if (
    profileOrganizationId &&
    memberships.some((membership) => membership.organization_id === profileOrganizationId)
  ) {
    return profileOrganizationId;
  }

  return pickDefaultOrganizationId(memberships) ?? profileOrganizationId;
}

export async function normalizeSessionOrganizationId(
  identity: ProfileIdentity
): Promise<string | null> {
  if (identity.organizationSelection === 'personal') {
    return null;
  }

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

export async function seedDefaultOrganizationIdIfMissing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  identity: ProfileIdentity
): Promise<boolean> {
  const targetOrganizationId = identity.organizationId?.trim() || null;
  if (!targetOrganizationId) {
    return false;
  }

  try {
    const profileId = await resolveProfileUserId(supabase, {
      userId: identity.userId,
      email: identity.email,
    });

    if (!profileId) {
      return false;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', profileId)
      .single();

    if (isMissingProfileOrganizationColumnError(error)) {
      const fallbackState = await readProfileOrganizationStateViaPg({
        userId: profileId,
        email: identity.email,
      });

      if (fallbackState?.organizationId) {
        return false;
      }

      return updateProfileOrganizationIdViaPg(profileId, targetOrganizationId);
    }

    if (error && !isMissingRowError(error)) {
      return false;
    }

    if (typeof profile?.organization_id === 'string' && profile.organization_id.trim()) {
      return false;
    }

    return updateProfileOrganizationId(
      supabase,
      {
        userId: profileId,
        email: identity.email,
      },
      targetOrganizationId
    );
  } catch {
    return false;
  }
}

export async function updateProfileOrganizationId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  identity: ProfileIdentity,
  organizationId: string | null
): Promise<boolean> {
  const profileId = await resolveProfileUserId(supabase, {
    userId: identity.userId,
    email: identity.email,
  });

  if (!profileId) {
    return false;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ organization_id: organizationId })
    .eq('id', profileId)
    .select('id')
    .single();

  if (isMissingProfileOrganizationColumnError(error)) {
    return updateProfileOrganizationIdViaPg(profileId, organizationId);
  }

  if (!error && data?.id) {
    return true;
  }

  const fallbackState = await readProfileOrganizationStateViaPg(identity);
  if (fallbackState?.profileId) {
    return updateProfileOrganizationIdViaPg(fallbackState.profileId, organizationId);
  }

  const ensuredProfileId = await ensureProfileExists(supabase, identity, profileId);
  if (ensuredProfileId) {
    const { data: ensuredData, error: ensuredError } = await supabase
      .from('profiles')
      .update({ organization_id: organizationId })
      .eq('id', ensuredProfileId)
      .select('id')
      .single();

    if (isMissingProfileOrganizationColumnError(ensuredError)) {
      return updateProfileOrganizationIdViaPg(ensuredProfileId, organizationId);
    }

    if (!ensuredError && ensuredData?.id) {
      return true;
    }
  }

  return updateProfileOrganizationIdViaPg(profileId, organizationId);
}
