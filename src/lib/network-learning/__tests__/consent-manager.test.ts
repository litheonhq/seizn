/**
 * Consent Manager Tests
 *
 * Tests for user consent management:
 * - Opt-in/opt-out operations
 * - Granular data type control
 * - Consent verification
 * - Privacy protection
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ConsentStatus, SignalType, ConsentRecord } from '../types';

// Mock Supabase
const mockSupabaseFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: () => ({
    from: mockSupabaseFrom,
  }),
}));

import {
  getConsent,
  getEffectiveConsent,
  optIn,
  optOut,
  updateDataTypes,
  hasConsent,
  hasAllConsents,
  getConsentedUsers,
  getAvailableSignalTypes,
} from '../consent/consent-manager';

describe('ConsentManager', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getConsent', () => {
    it('should return user consent if exists', async () => {
      const mockRecord: ConsentRecord = {
        id: 'consent-1',
        user_id: userId,
        status: 'opted_in',
        data_types: ['query_pattern', 'feedback'],
        consented_at: '2024-01-01T00:00:00Z',
        revoked_at: null,
        version: '1.0.0',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      };

      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: mockRecord,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getConsent(userId);

      expect(result).not.toBeNull();
      expect(result?.status).toBe('opted_in');
      expect(result?.dataTypes).toContain('query_pattern');
    });

    it('should return null if no consent exists', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getConsent(userId);

      expect(result).toBeNull();
    });

    it('should throw on database error', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'Database error' },
                }),
              }),
            }),
          }),
        }),
      });

      await expect(getConsent(userId)).rejects.toThrow();
    });
  });

  describe('optIn', () => {
    it('should create new consent record', async () => {
      // Mock getConsent returning null (no existing)
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock insert
      mockSupabaseFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'consent-new',
                user_id: userId,
                status: 'opted_in',
                data_types: ['query_pattern', 'plan_path', 'retrieval_metric', 'feedback'],
                consented_at: new Date().toISOString(),
                revoked_at: null,
                version: '1.0.0',
              },
              error: null,
            }),
          }),
        }),
      });

      const result = await optIn(userId);

      expect(result.status).toBe('opted_in');
      expect(result.dataTypes.length).toBeGreaterThan(0);
    });

    it('should update existing consent record', async () => {
      // Mock existing consent
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'consent-1',
                    user_id: userId,
                    status: 'opted_out',
                    data_types: [],
                    version: '1.0.0',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock update
      mockSupabaseFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'consent-1',
                  user_id: userId,
                  status: 'opted_in',
                  data_types: ['query_pattern'],
                  consented_at: new Date().toISOString(),
                  version: '1.0.0',
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await optIn(userId, ['query_pattern']);

      expect(result.status).toBe('opted_in');
    });

    it('should require at least one valid data type', async () => {
      await expect(optIn(userId, [])).rejects.toThrow('At least one valid data type');
    });

    it('should filter invalid data types', async () => {
      // Mock no existing consent
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock insert
      mockSupabaseFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'consent-new',
                user_id: userId,
                status: 'opted_in',
                data_types: ['query_pattern'],
                version: '1.0.0',
              },
              error: null,
            }),
          }),
        }),
      });

      // Include invalid type
      const result = await optIn(userId, ['query_pattern', 'invalid_type' as SignalType]);

      expect(result.dataTypes).toContain('query_pattern');
      expect(result.dataTypes).not.toContain('invalid_type');
    });
  });

  describe('optOut', () => {
    it('should update existing consent to opted out', async () => {
      // Mock existing consent
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'consent-1',
                    user_id: userId,
                    status: 'opted_in',
                    data_types: ['query_pattern'],
                    version: '1.0.0',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock update
      mockSupabaseFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'consent-1',
                  user_id: userId,
                  status: 'opted_out',
                  data_types: ['query_pattern'],
                  revoked_at: new Date().toISOString(),
                  version: '1.0.0',
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await optOut(userId);

      expect(result.status).toBe('opted_out');
      expect(result.revokedAt).toBeDefined();
    });

    it('should create opt-out record if none exists', async () => {
      // Mock no existing consent
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock insert
      mockSupabaseFrom.mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'consent-new',
                user_id: userId,
                status: 'opted_out',
                data_types: [],
                revoked_at: new Date().toISOString(),
                version: '1.0.0',
              },
              error: null,
            }),
          }),
        }),
      });

      const result = await optOut(userId);

      expect(result.status).toBe('opted_out');
    });
  });

  describe('updateDataTypes', () => {
    it('should update data types for opted-in user', async () => {
      // Mock existing opted-in consent
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'consent-1',
                    user_id: userId,
                    status: 'opted_in',
                    data_types: ['query_pattern'],
                    version: '1.0.0',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      // Mock update
      mockSupabaseFrom.mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: {
                  id: 'consent-1',
                  user_id: userId,
                  status: 'opted_in',
                  data_types: ['query_pattern', 'feedback'],
                  version: '1.0.0',
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await updateDataTypes(userId, ['query_pattern', 'feedback']);

      expect(result.dataTypes).toContain('feedback');
    });

    it('should throw if user not opted in', async () => {
      // Mock user not opted in
      mockSupabaseFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    status: 'opted_out',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      await expect(updateDataTypes(userId, ['query_pattern'])).rejects.toThrow(
        'User must be opted in'
      );
    });
  });

  describe('hasConsent', () => {
    it('should return true if user consented to signal type', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    status: 'opted_in',
                    data_types: ['query_pattern', 'feedback'],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasConsent(userId, 'query_pattern');

      expect(result).toBe(true);
    });

    it('should return false if user did not consent to signal type', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    status: 'opted_in',
                    data_types: ['query_pattern'],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasConsent(userId, 'feedback');

      expect(result).toBe(false);
    });

    it('should return false if user is opted out', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    status: 'opted_out',
                    data_types: ['query_pattern'],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasConsent(userId, 'query_pattern');

      expect(result).toBe(false);
    });

    it('should return true when no consent record exists (default opt-in)', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasConsent(userId, 'query_pattern');

      expect(result).toBe(true);
    });
  });

  describe('getEffectiveConsent', () => {
    it('should return default opted-in consent when no record exists', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getEffectiveConsent(userId);

      expect(result.status).toBe('opted_in');
      expect(result.dataTypes).toContain('query_pattern');
      expect(result.dataTypes).toContain('feedback');
    });
  });

  describe('hasAllConsents', () => {
    it('should return true if user consented to all types', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    status: 'opted_in',
                    data_types: ['query_pattern', 'feedback', 'plan_path'],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasAllConsents(userId, ['query_pattern', 'feedback']);

      expect(result).toBe(true);
    });

    it('should return false if user missing any consent', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    status: 'opted_in',
                    data_types: ['query_pattern'],
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await hasAllConsents(userId, ['query_pattern', 'feedback']);

      expect(result).toBe(false);
    });
  });

  describe('getConsentedUsers', () => {
    it('should return list of consented user IDs', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            contains: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [
                  { user_id: 'user-1' },
                  { user_id: 'user-2' },
                  { user_id: 'user-3' },
                ],
                error: null,
              }),
            }),
          }),
        }),
      });

      const result = await getConsentedUsers('query_pattern');

      expect(result).toContain('user-1');
      expect(result).toContain('user-2');
      expect(result.length).toBe(3);
    });
  });

  describe('getAvailableSignalTypes', () => {
    it('should return all available signal types', () => {
      const types = getAvailableSignalTypes();

      expect(types).toContain('query_pattern');
      expect(types).toContain('plan_path');
      expect(types).toContain('retrieval_metric');
      expect(types).toContain('feedback');
    });
  });

  describe('Privacy protection', () => {
    it('should not expose internal database fields', async () => {
      mockSupabaseFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'consent-1',
                    user_id: userId,
                    status: 'opted_in',
                    data_types: ['query_pattern'],
                    consented_at: '2024-01-01T00:00:00Z',
                    revoked_at: null,
                    version: '1.0.0',
                    created_at: '2024-01-01T00:00:00Z',
                    updated_at: '2024-01-01T00:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const result = await getConsent(userId);

      // Result should not have internal DB fields exposed
      expect(result).not.toHaveProperty('created_at');
      expect(result).not.toHaveProperty('updated_at');
      expect(result).not.toHaveProperty('id');
    });
  });
});
