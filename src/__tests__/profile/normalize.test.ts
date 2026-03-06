import { describe, expect, it, vi } from 'vitest';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';
import { normalizeProfileUserId } from '@/lib/profile/normalize';

describe('normalizeProfileUserId', () => {
  it('returns null when no identity is provided', async () => {
    await expect(normalizeProfileUserId({})).resolves.toBeNull();
  });

  it('returns the original user id when service role config is unavailable', async () => {
    vi.mocked(hasServerSupabaseServiceRoleConfig).mockReturnValueOnce(false);

    await expect(
      normalizeProfileUserId({
        userId: ' auth-user-1 ',
        email: 'User@Example.com',
      })
    ).resolves.toBe('auth-user-1');

    expect(createServerClient).not.toHaveBeenCalled();
  });

  it('resolves the profile id by email when the raw id is missing in profiles', async () => {
    vi.mocked(createServerClient).mockReturnValueOnce({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn((column: string, value: string) => ({
          single: vi.fn().mockResolvedValue(
            column === 'id' && value === 'auth-user-1'
              ? {
                  data: null,
                  error: {
                    code: 'PGRST116',
                    message: 'JSON object requested, multiple (or no) rows returned',
                  },
                }
              : {
                  data: { id: 'profile-1' },
                  error: null,
                }
          ),
        })),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await expect(
      normalizeProfileUserId({
        userId: 'auth-user-1',
        email: 'User@Example.com',
      })
    ).resolves.toBe('profile-1');
  });
});
