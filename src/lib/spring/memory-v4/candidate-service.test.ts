/**
 * Candidate Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CandidateService } from './candidate-service';

// Mock generateEmbedding
vi.mock('@/lib/embeddings', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

describe('CandidateService', () => {
  let service: CandidateService;
  let mockSupabase: ReturnType<typeof createMockSupabase>;

  function createMockSupabase() {
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    return {
      from: vi.fn(() => mockQueryBuilder),
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
      _queryBuilder: mockQueryBuilder,
    };
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase();
    service = new CandidateService(mockSupabase as any);
  });

  describe('createCandidate', () => {
    it('should create a candidate with correct v3 column names', async () => {
      const mockCandidate = {
        id: 'candidate-123',
        user_id: 'user-123',
        content: 'Test memory content',
        note_type: 'fact',
        tags: ['test'],
        categories: ['general'],
        confidence: 0.85,
        metadata: {},
        provenance: {},
        action: 'pending',
        namespace: 'default',
        scope: 'user',
        source_type: 'ingestion',
        created_at: new Date().toISOString(),
      };

      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: mockCandidate,
        error: null,
      });

      const result = await service.createCandidate('user-123', {
        content: 'Test memory content',
        noteType: 'fact',
        tags: ['test'],
        categories: ['general'],
        confidence: 0.85,
      });

      expect(mockSupabase.from).toHaveBeenCalledWith('spring_memory_candidates');
      expect(mockSupabase._queryBuilder.insert).toHaveBeenCalled();

      const insertCall = mockSupabase._queryBuilder.insert.mock.calls[0][0];
      expect(insertCall).toMatchObject({
        user_id: 'user-123',
        content: 'Test memory content',
        note_type: 'fact',
        tags: ['test'],
        categories: ['general'],
        confidence: 0.85,
      });

      expect(result.id).toBe('candidate-123');
      expect(result.content).toBe('Test memory content');
      expect(result.noteType).toBe('fact');
    });

    it('should throw error when insert fails', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { message: 'Insert failed' },
      });

      await expect(
        service.createCandidate('user-123', { content: 'Test' })
      ).rejects.toThrow('Failed to create candidate: Insert failed');
    });
  });

  describe('createCandidates (batch)', () => {
    it('should properly bind this in map function', async () => {
      const mockCandidates = [
        {
          id: 'candidate-1',
          user_id: 'user-123',
          content: 'Content 1',
          note_type: 'fact',
          tags: [],
          categories: [],
          confidence: 0.8,
          metadata: {},
          provenance: {},
          action: 'pending',
          namespace: 'default',
          scope: 'user',
          source_type: 'ingestion',
          created_at: new Date().toISOString(),
        },
        {
          id: 'candidate-2',
          user_id: 'user-123',
          content: 'Content 2',
          note_type: 'fact',
          tags: [],
          categories: [],
          confidence: 0.8,
          metadata: {},
          provenance: {},
          action: 'pending',
          namespace: 'default',
          scope: 'user',
          source_type: 'ingestion',
          created_at: new Date().toISOString(),
        },
      ];

      mockSupabase._queryBuilder.select.mockResolvedValueOnce({
        data: mockCandidates,
        error: null,
      });

      const result = await service.createCandidates('user-123', [
        { content: 'Content 1' },
        { content: 'Content 2' },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].content).toBe('Content 1');
      expect(result[1].content).toBe('Content 2');
    });
  });

  describe('acceptCandidate', () => {
    it('should call RPC function with correct parameters', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: 'note-123',
        error: null,
      });

      const result = await service.acceptCandidate(
        'candidate-123',
        'reviewer-123',
        'Looks good'
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('accept_memory_candidate', {
        p_candidate_id: 'candidate-123',
        p_reviewer_id: 'reviewer-123',
        p_reason: 'Looks good',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('accepted');
      expect(result.noteId).toBe('note-123');
    });

    it('should return error when RPC fails', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Candidate not found' },
      });

      const result = await service.acceptCandidate('invalid-id', 'reviewer-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Candidate not found');
    });
  });

  describe('rejectCandidate', () => {
    it('should call RPC function for rejection', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: true,
        error: null,
      });

      const result = await service.rejectCandidate(
        'candidate-123',
        'reviewer-123',
        'Not relevant'
      );

      expect(mockSupabase.rpc).toHaveBeenCalledWith('reject_memory_candidate', {
        p_candidate_id: 'candidate-123',
        p_reviewer_id: 'reviewer-123',
        p_reason: 'Not relevant',
      });

      expect(result.success).toBe(true);
      expect(result.action).toBe('rejected');
    });
  });

  describe('acceptWithModifications', () => {
    it('should use v3 column names when inserting into spring_memory_notes', async () => {
      const mockCandidate = {
        id: 'candidate-123',
        user_id: 'user-123',
        workspace_id: null,
        content: 'Original content',
        note_type: 'fact',
        tags: ['tag1'],
        categories: ['cat1'],
        confidence: 0.8,
        metadata: { source: 'test' },
        provenance: {},
        action: 'pending',
        namespace: 'default',
        scope: 'user',
        source_type: 'ingestion',
        created_at: new Date().toISOString(),
      };

      // First call: getCandidate
      mockSupabase._queryBuilder.single
        .mockResolvedValueOnce({ data: mockCandidate, error: null })
        // Second call: insert into spring_memory_notes
        .mockResolvedValueOnce({ data: { id: 'note-456' }, error: null });

      const result = await service.acceptWithModifications(
        'candidate-123',
        'reviewer-123',
        { content: 'Modified content', tags: ['new-tag'] },
        'Modified before accepting'
      );

      // Check the insert was called with v3 column names
      const insertCalls = mockSupabase._queryBuilder.insert.mock.calls;
      const noteInsert = insertCalls.find((call: any[]) => {
        const arg = call[0];
        return arg && 'content' in arg && 'note_type' in arg;
      });

      expect(noteInsert).toBeDefined();
      const insertData = noteInsert![0];

      // Verify v3 column names are used
      expect(insertData).toHaveProperty('content', 'Modified content');
      expect(insertData).toHaveProperty('note_type', 'fact');
      expect(insertData).toHaveProperty('confidence', 0.8);
      expect(insertData).toHaveProperty('payload_json');

      // Verify old column names are NOT used
      expect(insertData).not.toHaveProperty('note');
      expect(insertData).not.toHaveProperty('type');
      expect(insertData).not.toHaveProperty('confidence_score');
      expect(insertData).not.toHaveProperty('metadata');

      expect(result.success).toBe(true);
      expect(result.noteId).toBe('note-456');
    });

    it('should return error if candidate not found', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116' },
      });

      const result = await service.acceptWithModifications(
        'invalid-id',
        'reviewer-123',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Candidate not found');
    });

    it('should return error if candidate already processed', async () => {
      mockSupabase._queryBuilder.single.mockResolvedValueOnce({
        data: {
          id: 'candidate-123',
          action: 'accepted', // Already processed
          user_id: 'user-123',
          content: 'Content',
          note_type: 'fact',
          tags: [],
          categories: [],
          confidence: 0.8,
          metadata: {},
          provenance: {},
          namespace: 'default',
          scope: 'user',
          source_type: 'ingestion',
          created_at: new Date().toISOString(),
        },
        error: null,
      });

      const result = await service.acceptWithModifications(
        'candidate-123',
        'reviewer-123',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Candidate already processed');
    });
  });

  describe('listCandidates', () => {
    it('should properly map candidates from DB', async () => {
      const mockData = [
        {
          id: 'c1',
          user_id: 'user-123',
          content: 'Test 1',
          note_type: 'fact',
          tags: ['t1'],
          categories: ['cat1'],
          confidence: 0.9,
          metadata: { key: 'value' },
          provenance: {},
          action: 'pending',
          namespace: 'default',
          scope: 'user',
          source_type: 'ingestion',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      mockSupabase._queryBuilder.order.mockReturnThis();
      // Mock the final query result
      const mockFinalQuery = {
        ...mockSupabase._queryBuilder,
        then: vi.fn((resolve) => resolve({ data: mockData, error: null })),
      };
      mockSupabase._queryBuilder.order.mockReturnValue(mockFinalQuery);

      // The query chain returns the data
      mockSupabase.from.mockReturnValue({
        ...mockSupabase._queryBuilder,
        select: vi.fn().mockReturnValue({
          ...mockSupabase._queryBuilder,
          eq: vi.fn().mockReturnValue({
            ...mockSupabase._queryBuilder,
            order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
          }),
        }),
      });

      const result = await service.listCandidates('user-123', { action: 'pending' });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Test 1');
      expect(result[0].noteType).toBe('fact');
      expect(result[0].metadata).toEqual({ key: 'value' });
    });
  });
});
