import { describe, expect, it, vi } from 'vitest';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import {
  normalizeSessionOrganizationId,
  resolveSessionOrganizationId,
  seedDefaultOrganizationIdIfMissing,
} from '@/lib/profile/organization';

function createOrganizationResolverClient(
  rowsByMatcher: Record<string, { data: unknown; error: unknown }>
) {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            const result = rowsByMatcher[`${table}:${column}:${value}`] ?? {
              data: null,
              error: null,
            };

            return {
              single: async () => result,
            };
          },
        };
      }

      if (table === 'organization_members') {
        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            return rowsByMatcher[`${table}:${column}:${value}`] ?? {
              data: null,
              error: null,
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };
}

describe('resolveSessionOrganizationId', () => {
  it('returns the explicit organization id when already provided', async () => {
    const supabase = createOrganizationResolverClient({});

    await expect(
      resolveSessionOrganizationId(supabase, {
        userId: 'profile-1',
        organizationId: 'org-explicit',
      })
    ).resolves.toBe('org-explicit');
  });

  it('returns the profile organization id when present', async () => {
    const supabase = createOrganizationResolverClient({
      'profiles:id:profile-1': {
        data: { id: 'profile-1', organization_id: 'org-profile' },
        error: null,
      },
      'organization_members:user_id:profile-1': {
        data: [
          { organization_id: 'org-profile', role: 'owner', created_at: '2026-03-01T00:00:00Z' },
        ],
        error: null,
      },
    });

    await expect(
      resolveSessionOrganizationId(supabase, {
        userId: 'profile-1',
        email: 'user@example.com',
      })
    ).resolves.toBe('org-profile');
  });

  it('falls back to email profile lookup when the raw id is not a profile id', async () => {
    const supabase = createOrganizationResolverClient({
      'profiles:id:auth-user-1': {
        data: null,
        error: { code: 'PGRST116', message: 'multiple (or no) rows returned' },
      },
      'profiles:email:user@example.com': {
        data: { id: 'profile-1', organization_id: 'org-email' },
        error: null,
      },
      'organization_members:user_id:profile-1': {
        data: [
          { organization_id: 'org-email', role: 'member', created_at: '2026-03-01T00:00:00Z' },
        ],
        error: null,
      },
    });

    await expect(
      resolveSessionOrganizationId(supabase, {
        userId: 'auth-user-1',
        email: 'user@example.com',
      })
    ).resolves.toBe('org-email');
  });

  it('falls back to the highest priority organization membership when profile org is empty', async () => {
    const supabase = createOrganizationResolverClient({
      'profiles:id:profile-2': {
        data: { id: 'profile-2', organization_id: null },
        error: null,
      },
      'organization_members:user_id:profile-2': {
        data: [
          { organization_id: 'org-member', role: 'member', created_at: '2026-03-02T00:00:00Z' },
          { organization_id: 'org-admin', role: 'admin', created_at: '2026-03-03T00:00:00Z' },
          { organization_id: 'org-owner', role: 'owner', created_at: '2026-03-04T00:00:00Z' },
        ],
        error: null,
      },
    });

    await expect(
      resolveSessionOrganizationId(supabase, {
        userId: 'profile-2',
      })
    ).resolves.toBe('org-owner');
  });

  it('falls back when the stored profile organization is no longer a current membership', async () => {
    const supabase = createOrganizationResolverClient({
      'profiles:id:profile-6': {
        data: { id: 'profile-6', organization_id: 'org-stale' },
        error: null,
      },
      'organization_members:user_id:profile-6': {
        data: [
          { organization_id: 'org-admin', role: 'admin', created_at: '2026-03-01T00:00:00Z' },
          { organization_id: 'org-member', role: 'member', created_at: '2026-03-02T00:00:00Z' },
        ],
        error: null,
      },
    });

    await expect(
      resolveSessionOrganizationId(supabase, {
        userId: 'profile-6',
      })
    ).resolves.toBe('org-admin');
  });
});

describe('normalizeSessionOrganizationId', () => {
  it('returns null without service role config', async () => {
    vi.mocked(hasServerSupabaseServiceRoleConfig).mockReturnValueOnce(false);

    await expect(
      normalizeSessionOrganizationId({
        userId: 'profile-1',
        email: 'user@example.com',
      })
    ).resolves.toBeNull();

    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('uses the server client when service role config is available', async () => {
    vi.mocked(createServerClient).mockReturnValueOnce(
      createOrganizationResolverClient({
        'profiles:id:profile-3': {
          data: { id: 'profile-3', organization_id: 'org-server' },
          error: null,
        },
      }) as never
    );

    await expect(
      normalizeSessionOrganizationId({
        userId: 'profile-3',
      })
    ).resolves.toBe('org-server');
  });
});

describe('seedDefaultOrganizationIdIfMissing', () => {
  it('updates the profile when no default organization is set', async () => {
    const updateEq = vi.fn().mockReturnValue({
      select() {
        return {
          single: async () => ({ data: { id: 'profile-4' }, error: null }),
        };
      },
    });
    const supabase = {
      from(table: string) {
        if (table !== 'profiles') {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            if (column === 'id' && value === 'profile-4') {
              return {
                single: async () => ({
                  data: { id: 'profile-4', organization_id: null },
                  error: null,
                }),
              };
            }

            if (column === 'email' && value === 'user@example.com') {
              return {
                single: async () => ({
                  data: { id: 'profile-4' },
                  error: null,
                }),
              };
            }

            return {
              single: async () => ({ data: null, error: null }),
            };
          },
          update() {
            return {
              eq: updateEq,
            };
          },
        };
      },
    };

    await expect(
      seedDefaultOrganizationIdIfMissing(supabase, {
        userId: 'profile-4',
        email: 'user@example.com',
        organizationId: 'org-seeded',
      })
    ).resolves.toBe(true);

    expect(updateEq).toHaveBeenCalledWith('id', 'profile-4');
  });

  it('does not overwrite an existing default organization', async () => {
    const updateEq = vi.fn();
    const supabase = {
      from(table: string) {
        if (table !== 'profiles') {
          throw new Error(`Unexpected table ${table}`);
        }

        return {
          select() {
            return this;
          },
          eq(column: string, value: string) {
            if (column === 'id' && value === 'profile-5') {
              return {
                single: async () => ({
                  data: { id: 'profile-5', organization_id: 'org-existing' },
                  error: null,
                }),
              };
            }

            return {
              single: async () => ({ data: null, error: null }),
            };
          },
          update() {
            return {
              eq: updateEq,
            };
          },
        };
      },
    };

    await expect(
      seedDefaultOrganizationIdIfMissing(supabase, {
        userId: 'profile-5',
        organizationId: 'org-new',
      })
    ).resolves.toBe(false);

    expect(updateEq).not.toHaveBeenCalled();
  });
});
