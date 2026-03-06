import { describe, expect, it } from 'vitest';
import { resolveProfileUserId } from '@/lib/profile/resolve';

function createProfilesClient(rowsByMatcher: Record<string, { data: unknown; error: unknown }>) {
  return {
    from(table: string) {
      expect(table).toBe('profiles');

      return {
        select() {
          return this;
        },
        eq(column: string, value: string) {
          const result = rowsByMatcher[`${column}:${value}`] ?? { data: null, error: null };

          return {
            single: async () => result,
          };
        },
      };
    },
  };
}

describe('resolveProfileUserId', () => {
  it('returns the direct profile id match when available', async () => {
    const supabase = createProfilesClient({
      'id:user-1': { data: { id: 'user-1' }, error: null },
    });

    await expect(
      resolveProfileUserId(supabase, { userId: 'user-1', email: 'user@example.com' })
    ).resolves.toBe('user-1');
  });

  it('falls back to email when the session id is not a profile id', async () => {
    const supabase = createProfilesClient({
      'id:auth-user-1': {
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
      },
      'email:user@example.com': { data: { id: 'profile-1' }, error: null },
    });

    await expect(
      resolveProfileUserId(supabase, { userId: 'auth-user-1', email: 'user@example.com' })
    ).resolves.toBe('profile-1');
  });

  it('falls back to the original user id when profile lookup errors unexpectedly', async () => {
    const supabase = createProfilesClient({
      'id:auth-user-2': {
        data: null,
        error: { code: 'XX000', message: 'db unavailable' },
      },
    });

    await expect(
      resolveProfileUserId(supabase, { userId: 'auth-user-2', email: 'user2@example.com' })
    ).resolves.toBe('auth-user-2');
  });
});
