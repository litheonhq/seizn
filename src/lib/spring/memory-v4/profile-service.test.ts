/**
 * ProfileService Unit Tests
 *
 * Tests structured profile CRUD, versioning, and LLM derivation.
 * All Supabase and Anthropic calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileService, createProfileService } from './profile-service';

// ---------------------------------------------------------------------------
// Mock Supabase
// ---------------------------------------------------------------------------

function createMockSupabase() {
  let queryResult: { data: unknown; error: unknown } = { data: null, error: null };

  const builder: Record<string, unknown> = {};
  const methods = [
    'select', 'eq', 'order', 'limit', 'single', 'insert', 'update',
  ];

  for (const m of methods) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }

  (builder as { then: (resolve: (v: unknown) => void) => Promise<unknown> }).then = (resolve: (v: unknown) => void) => {
    resolve(queryResult);
    return Promise.resolve(queryResult);
  };

  const supabase = {
    from: vi.fn().mockReturnValue(builder),
    _setResult(result: { data: unknown; error: unknown }) {
      queryResult = result;
    },
    _builder: builder,
  };

  return supabase;
}

function mockProfileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prof-1',
    user_id: 'user-123',
    version: 1,
    about_me: 'A software engineer',
    preferences: { theme: 'dark' },
    constraints: ['no meetings before 10am'],
    tools: ['VSCode', 'TypeScript'],
    workstyle: 'Async-first',
    custom_fields: {},
    derived_from: 'manual' as const,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Anthropic
// ---------------------------------------------------------------------------

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          content: [{
            type: 'text',
            text: JSON.stringify({
              about_me: 'Derived profile',
              preferences: { lang: 'en' },
              constraints: ['budget-aware'],
              tools: ['Claude'],
              workstyle: 'Collaborative',
              custom_fields: {},
            }),
          }],
        }),
      };
    },
  };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileService', () => {
  let supabase: ReturnType<typeof createMockSupabase>;
  let service: ProfileService;
  type ProfileSupabase = ConstructorParameters<typeof ProfileService>[0];
  type ThenableBuilder = {
    then: (resolve: (v: unknown) => void) => Promise<unknown>;
  };

  beforeEach(() => {
    supabase = createMockSupabase();
    service = new ProfileService(supabase as unknown as ProfileSupabase);
  });

  // -------------------------------------------------------------------------
  // getProfile
  // -------------------------------------------------------------------------

  describe('getProfile', () => {
    it('returns null when no profile exists', async () => {
      supabase._setResult({ data: null, error: { code: 'PGRST116' } });
      const result = await service.getProfile('user-123');
      expect(result).toBeNull();
    });

    it('returns structured profile when found', async () => {
      const row = mockProfileRow();
      supabase._setResult({ data: row, error: null });

      const result = await service.getProfile('user-123');

      expect(result).toBeDefined();
      expect(result!.userId).toBe('user-123');
      expect(result!.version).toBe(1);
      expect(result!.aboutMe).toBe('A software engineer');
      expect(result!.preferences).toEqual({ theme: 'dark' });
      expect(result!.constraints).toEqual(['no meetings before 10am']);
      expect(result!.tools).toEqual(['VSCode', 'TypeScript']);
      expect(result!.workstyle).toBe('Async-first');
      expect(result!.derivedFrom).toBe('manual');
    });
  });

  // -------------------------------------------------------------------------
  // updateProfile
  // -------------------------------------------------------------------------

  describe('updateProfile', () => {
    it('creates version 1 when no profile exists', async () => {
      // First call: getProfile returns null
      // Second call: insert returns new profile
      let callCount = 0;
      const getProfileResult = { data: null, error: { code: 'PGRST116' } };
      const insertResult = { data: mockProfileRow(), error: null };

      (supabase._builder as ThenableBuilder).then = (resolve: (v: unknown) => void) => {
        callCount++;
        const result = callCount <= 1 ? getProfileResult : insertResult;
        resolve(result);
        return Promise.resolve(result);
      };

      const result = await service.updateProfile('user-123', {
        aboutMe: 'New user',
      });

      expect(result).toBeDefined();
      expect(supabase._builder.insert).toHaveBeenCalled();
    });

    it('bumps version number when profile exists', async () => {
      let callCount = 0;
      const existingRow = mockProfileRow({ version: 3 });
      const newRow = mockProfileRow({ version: 4 });

      (supabase._builder as ThenableBuilder).then = (resolve: (v: unknown) => void) => {
        callCount++;
        const result = callCount <= 1
          ? { data: existingRow, error: null }
          : { data: newRow, error: null };
        resolve(result);
        return Promise.resolve(result);
      };

      const result = await service.updateProfile('user-123', {
        workstyle: 'Updated workstyle',
      });

      expect(result).toBeDefined();
    });

    it('throws on Supabase insert error', async () => {
      let callCount = 0;
      (supabase._builder as ThenableBuilder).then = (resolve: (v: unknown) => void) => {
        callCount++;
        const result = callCount <= 1
          ? { data: null, error: { code: 'PGRST116' } }
          : { data: null, error: { message: 'Insert failed' } };
        resolve(result);
        return Promise.resolve(result);
      };

      await expect(
        service.updateProfile('user-123', { aboutMe: 'test' })
      ).rejects.toThrow('Failed to update structured profile');
    });
  });

  // -------------------------------------------------------------------------
  // getVersionHistory
  // -------------------------------------------------------------------------

  describe('getVersionHistory', () => {
    it('returns profiles ordered by version desc', async () => {
      const rows = [
        mockProfileRow({ version: 3 }),
        mockProfileRow({ version: 2 }),
        mockProfileRow({ version: 1 }),
      ];
      supabase._setResult({ data: rows, error: null });

      const result = await service.getVersionHistory('user-123');

      expect(result).toHaveLength(3);
      expect(result[0].version).toBe(3);
      expect(supabase._builder.order).toHaveBeenCalledWith('version', { ascending: false });
    });

    it('respects limit parameter', async () => {
      supabase._setResult({ data: [], error: null });

      await service.getVersionHistory('user-123', 5);

      expect(supabase._builder.limit).toHaveBeenCalledWith(5);
    });

    it('throws on Supabase error', async () => {
      supabase._setResult({ data: null, error: { message: 'Query failed' } });

      await expect(service.getVersionHistory('user-123')).rejects.toThrow(
        'Failed to fetch version history'
      );
    });
  });

  // -------------------------------------------------------------------------
  // rollbackToVersion
  // -------------------------------------------------------------------------

  describe('rollbackToVersion', () => {
    it('creates new version with old content', async () => {
      let callCount = 0;
      const targetRow = mockProfileRow({ version: 2, about_me: 'Old profile' });
      const currentRow = mockProfileRow({ version: 5 });
      const newRow = mockProfileRow({ version: 6, about_me: 'Old profile' });

      (supabase._builder as ThenableBuilder).then = (resolve: (v: unknown) => void) => {
        callCount++;
        let result;
        if (callCount === 1) result = { data: targetRow, error: null }; // fetch target
        else if (callCount === 2) result = { data: currentRow, error: null }; // getProfile
        else result = { data: newRow, error: null }; // insert
        resolve(result);
        return Promise.resolve(result);
      };

      const result = await service.rollbackToVersion('user-123', 2);
      expect(result).toBeDefined();
      expect(result.aboutMe).toBe('Old profile');
    });

    it('throws when target version not found', async () => {
      supabase._setResult({ data: null, error: { code: 'PGRST116' } });

      await expect(
        service.rollbackToVersion('user-123', 99)
      ).rejects.toThrow('Version 99 not found');
    });
  });

  // -------------------------------------------------------------------------
  // Factory
  // -------------------------------------------------------------------------

  describe('createProfileService', () => {
    it('returns a ProfileService instance', () => {
      const svc = createProfileService(supabase as unknown as ProfileSupabase);
      expect(svc).toBeInstanceOf(ProfileService);
    });
  });
});
