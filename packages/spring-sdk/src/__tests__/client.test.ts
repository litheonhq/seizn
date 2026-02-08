/**
 * SpringClient Unit Tests
 *
 * Tests the SDK client methods with mocked HTTP responses.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpringClient } from '../client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: new Headers(),
  };
}

describe('SpringClient', () => {
  let client: SpringClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SpringClient({
      apiKey: 'szn_test_key',
      baseUrl: 'https://test.seizn.com/api',
      namespace: 'test-ns',
      retries: 1,
    });
  });

  // ==================== Construction ====================

  it('should throw if no API key provided', () => {
    expect(() => new SpringClient({ apiKey: '' })).toThrow('API key is required');
  });

  it('should use default values', () => {
    const c = new SpringClient({ apiKey: 'szn_key' });
    expect(c).toBeDefined();
  });

  // ==================== Memory CRUD ====================

  it('should add a memory', async () => {
    const memory = { id: 'mem-1', content: 'test', memoryType: 'fact', tags: [], namespace: 'test-ns' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, memory }));

    const result = await client.add({ content: 'test', memory_type: 'fact' });

    expect(result).toEqual(memory);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://test.seizn.com/api/memories',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('should search memories', async () => {
    const results = [{ id: 'mem-1', content: 'test', similarity: 0.95 }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, mode: 'vector', results, count: 1 }));

    const response = await client.search('test query');

    expect(response.count).toBe(1);
    expect(response.results[0].similarity).toBe(0.95);
  });

  it('should search with options', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, mode: 'hybrid', results: [], count: 0 }));

    await client.search({ query: 'test', mode: 'hybrid', limit: 5, tags: ['important'] });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('mode=hybrid');
    expect(calledUrl).toContain('limit=5');
    expect(calledUrl).toContain('tags=important');
  });

  it('should get a memory by ID', async () => {
    const memory = { id: 'mem-1', content: 'test' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, memory }));

    const result = await client.get('mem-1');
    expect(result.id).toBe('mem-1');
  });

  it('should update a memory', async () => {
    const memory = { id: 'mem-1', content: 'updated', tags: ['new'] };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, memory }));

    const result = await client.update('mem-1', { tags: ['new'] });
    expect(result.tags).toEqual(['new']);
  });

  it('should delete memories', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, deleted: 2 }));

    const count = await client.delete(['mem-1', 'mem-2']);
    expect(count).toBe(2);
  });

  it('should delete single memory by string', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, deleted: 1 }));

    const count = await client.delete('mem-1');
    expect(count).toBe(1);
  });

  // ==================== Bulk Operations ====================

  it('should bulk add memories', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, added: 3, failed: 0 }));

    const result = await client.bulkAdd([
      { content: 'a' },
      { content: 'b' },
      { content: 'c' },
    ]);

    expect(result.added).toBe(3);
  });

  // ==================== Export/Import ====================

  it('should export memories', async () => {
    const exportData = { version: '1.0', memories: [], count: 0 };
    mockFetch.mockResolvedValueOnce(mockResponse(exportData));

    const result = await client.export();
    expect(result.version).toBe('1.0');
  });

  it('should import memories', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, imported: 5, skipped: 1, errors: [] }));

    const result = await client.import({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId: 'user-1',
      memories: [],
      count: 0,
    });

    expect(result.imported).toBe(5);
  });

  // ==================== Helpers ====================

  it('should remember (shorthand add)', async () => {
    const memory = { id: 'mem-1', content: 'remember this' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, memory }));

    const result = await client.remember('remember this', ['tag1']);
    expect(result.content).toBe('remember this');
  });

  it('should recall (shorthand search)', async () => {
    const results = [{ id: 'mem-1', content: 'found', similarity: 0.9 }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, results, count: 1 }));

    const memories = await client.recall('query');
    expect(memories).toHaveLength(1);
  });

  // ==================== Graph Operations ====================

  it('should get edges', async () => {
    const edges = [{ id: 'edge-1', srcMemoryId: 'a', dstMemoryId: 'b', edgeType: 'relates_to', weight: 1 }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, edges }));

    const result = await client.getEdges('mem-1');
    expect(result).toHaveLength(1);
    expect(result[0].edgeType).toBe('relates_to');
  });

  it('should create an edge', async () => {
    const edge = { id: 'edge-1', srcMemoryId: 'a', dstMemoryId: 'b', edgeType: 'supports', weight: 0.8 };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, edge }));

    const result = await client.createEdge({
      srcMemoryId: 'a',
      dstMemoryId: 'b',
      edgeType: 'supports',
      weight: 0.8,
    });

    expect(result.edgeType).toBe('supports');
  });

  it('should delete an edge', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true }));
    const result = await client.deleteEdge('edge-1');
    expect(result).toBe(true);
  });

  it('should get neighborhood', async () => {
    const neighbors = [
      { memoryId: 'mem-2', content: 'related', edgeType: 'relates_to', weight: 0.9, direction: 'outgoing', hops: 1 },
    ];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, neighbors }));

    const result = await client.getNeighborhood('mem-1', { max_hops: 3 });
    expect(result[0].hops).toBe(1);
  });

  // ==================== Temporal Operations ====================

  it('should do temporal search', async () => {
    const results = [{ id: 'mem-1', content: 'fact', type: 'fact', validFrom: '2026-01-01', validTo: null }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, results, count: 1 }));

    const response = await client.temporalSearch({ valid_at: '2026-01-15T00:00:00Z' });
    expect(response.count).toBe(1);
  });

  it('should get timeline', async () => {
    const entries = [{ id: 'mem-1', content: 'event', type: 'experience', eventTime: '2026-01-01', isCurrentlyValid: true }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, entries, count: 1 }));

    const response = await client.timeline({ limit: 10 });
    expect(response.entries).toHaveLength(1);
  });

  it('should get fact history', async () => {
    const history = [{ id: 'mem-1', content: 'v2' }, { id: 'mem-0', content: 'v1', supersededById: 'mem-1' }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, history, count: 2 }));

    const response = await client.factHistory('mem-1');
    expect(response.count).toBe(2);
  });

  it('should get changed facts', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, changes: [], count: 0 }));

    const response = await client.changedFacts('2026-01-01', '2026-02-01');
    expect(response.count).toBe(0);
  });

  it('should get temporal status', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      success: true,
      active: 100,
      expired: 5,
      superseded: 10,
      expiringSoon: 3,
      total: 115,
    }));

    const status = await client.temporalStatus();
    expect(status.active).toBe(100);
    expect(status.total).toBe(115);
  });

  // ==================== Ingestion Operations ====================

  it('should list ingestion rules', async () => {
    const rules = [{ id: 'rule-1', name: 'Block PII', action: 'redact' }];
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, rules }));

    const result = await client.listIngestionRules();
    expect(result).toHaveLength(1);
  });

  it('should create ingestion rule', async () => {
    const rule = { id: 'rule-1', name: 'Deny sensitive', action: 'deny' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, rule }));

    const result = await client.createIngestionRule({ name: 'Deny sensitive', action: 'deny' });
    expect(result.action).toBe('deny');
  });

  it('should get ingestion settings', async () => {
    const settings = { autoSaveEnabled: true, strictness: 'medium' };
    mockFetch.mockResolvedValueOnce(mockResponse({ success: true, settings }));

    const result = await client.getIngestionSettings();
    expect(result.autoSaveEnabled).toBe(true);
  });

  // ==================== Error Handling ====================

  it('should throw on 4xx errors without retry', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Not found' }, 404));

    await expect(client.get('non-existent')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1); // No retry
  });

  it('should call onError callback', async () => {
    const onError = vi.fn();
    const errorClient = new SpringClient({
      apiKey: 'szn_test',
      baseUrl: 'https://test.seizn.com/api',
      retries: 1,
      onError,
    });

    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'Bad' }, 400));

    await expect(errorClient.get('x')).rejects.toBeDefined();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
