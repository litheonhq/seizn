/**
 * Seizn LangChain Retriever Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SeiznRetriever, createSeiznRetriever } from './retriever';
import type { SearchResponse } from '@/lib/summer/sdk/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SeiznRetriever', () => {
  const defaultConfig = {
    apiKey: 'test-api-key',
    collectionId: 'test-collection',
  };

  const mockSearchResponse: SearchResponse = {
    success: true,
    results: [
      {
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        externalId: 'ext-1',
        title: 'Test Document',
        content: 'This is test content about machine learning.',
        similarity: 0.95,
        rerankScore: 0.98,
        metadata: { source: 'docs', category: 'ml' },
      },
      {
        chunkId: 'chunk-2',
        documentId: 'doc-2',
        content: 'Another document about AI systems.',
        similarity: 0.85,
        metadata: { source: 'wiki' },
      },
    ],
    count: 2,
    mode: 'hybrid',
    timings: {
      embedMs: 50,
      searchMs: 100,
      rerankMs: 30,
      totalMs: 180,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should create instance with required config', () => {
      const retriever = new SeiznRetriever(defaultConfig);
      expect(retriever).toBeInstanceOf(SeiznRetriever);
      expect(retriever.name).toBe('SeiznRetriever');
    });

    it('should throw error when apiKey is missing', () => {
      expect(() => {
        new SeiznRetriever({ apiKey: '', collectionId: 'test' });
      }).toThrow('SeiznRetriever: apiKey is required');
    });

    it('should throw error when collectionId is missing', () => {
      expect(() => {
        new SeiznRetriever({ apiKey: 'key', collectionId: '' });
      }).toThrow('SeiznRetriever: collectionId is required');
    });

    it('should use default values for optional config', () => {
      const retriever = new SeiznRetriever(defaultConfig);
      const config = retriever.getConfig();

      expect(config.apiKey).toBe('***'); // masked
      expect(config.baseUrl).toBe('https://www.seizn.com/api/summer');
      expect(config.topK).toBe(4);
      expect(config.searchMode).toBe('hybrid');
      expect(config.rerank).toBe(false);
      expect(config.includeMetadata).toBe(true);
      expect(config.timeout).toBe(60000);
      expect(config.retries).toBe(3);
    });

    it('should accept custom configuration', () => {
      const retriever = new SeiznRetriever({
        ...defaultConfig,
        baseUrl: 'https://custom.api.com',
        topK: 10,
        searchMode: 'vector',
        threshold: 0.7,
        rerank: true,
        rerankTopN: 5,
        filter: { category: 'docs' },
        timeout: 30000,
        retries: 5,
      });

      const config = retriever.getConfig();
      expect(config.baseUrl).toBe('https://custom.api.com');
      expect(config.topK).toBe(10);
      expect(config.searchMode).toBe('vector');
      expect(config.threshold).toBe(0.7);
      expect(config.rerank).toBe(true);
      expect(config.rerankTopN).toBe(5);
      expect(config.filter).toEqual({ category: 'docs' });
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(5);
    });
  });

  describe('getRelevantDocuments', () => {
    it('should fetch and return documents', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const retriever = new SeiznRetriever(defaultConfig);
      const docs = await retriever.getRelevantDocuments('machine learning query');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.seizn.com/api/summer/search',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-api-key',
            'Content-Type': 'application/json',
          },
        })
      );

      expect(docs).toHaveLength(2);
      expect(docs[0].pageContent).toBe('This is test content about machine learning.');
      expect(docs[0].metadata.chunkId).toBe('chunk-1');
      expect(docs[0].metadata.documentId).toBe('doc-1');
      expect(docs[0].metadata.similarity).toBe(0.95);
    });

    it('should convert Seizn results to LangChain Documents correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const retriever = new SeiznRetriever({ ...defaultConfig, rerank: true });
      const docs = await retriever.getRelevantDocuments('test query');

      // Check first document with all fields
      const doc1 = docs[0];
      expect(doc1.pageContent).toBe('This is test content about machine learning.');
      expect(doc1.metadata).toMatchObject({
        chunkId: 'chunk-1',
        documentId: 'doc-1',
        externalId: 'ext-1',
        title: 'Test Document',
        similarity: 0.95,
        rerankScore: 0.98,
        source: 'docs',
        category: 'ml',
      });

      // Check second document without optional fields
      const doc2 = docs[1];
      expect(doc2.pageContent).toBe('Another document about AI systems.');
      expect(doc2.metadata.externalId).toBeUndefined();
      expect(doc2.metadata.title).toBeUndefined();
      expect(doc2.metadata.source).toBe('wiki');
    });

    it('should include correct search parameters in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const retriever = new SeiznRetriever({
        ...defaultConfig,
        topK: 10,
        searchMode: 'vector',
        threshold: 0.7,
        rerank: true,
        rerankTopN: 5,
        filter: { type: 'article' },
      });

      await retriever.getRelevantDocuments('test');

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);

      expect(body).toEqual({
        collectionId: 'test-collection',
        query: 'test',
        topK: 10,
        mode: 'vector',
        rerank: true,
        rerankTopN: 5,
        threshold: 0.7,
        filter: { type: 'article' },
        includeMetadata: true,
      });
    });
  });

  describe('invoke', () => {
    it('should work as alternative to getRelevantDocuments', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const retriever = new SeiznRetriever(defaultConfig);
      const docs = await retriever.invoke('test query');

      expect(docs).toHaveLength(2);
      expect(docs[0].pageContent).toBe('This is test content about machine learning.');
    });
  });

  describe('batch', () => {
    it('should process multiple queries in parallel', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              ...mockSearchResponse,
              results: [mockSearchResponse.results[1]],
            }),
        });

      const retriever = new SeiznRetriever(defaultConfig);
      const results = await retriever.batch(['query 1', 'query 2']);

      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(2);
      expect(results[1]).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw on 4xx client errors without retry', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () =>
          Promise.resolve({
            code: 'UNAUTHORIZED',
            error: 'Invalid API key',
          }),
      });

      const retriever = new SeiznRetriever(defaultConfig);

      await expect(retriever.getRelevantDocuments('test')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Invalid API key',
        status: 401,
      });

      // Should not retry on 4xx
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 5xx server errors', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: 'Service unavailable' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockSearchResponse),
        });

      const retriever = new SeiznRetriever({ ...defaultConfig, retries: 3 });
      const docs = await retriever.getRelevantDocuments('test');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(docs).toHaveLength(2);
    });

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error('Timeout');
          error.name = 'AbortError';
          reject(error);
        });
      });

      const retriever = new SeiznRetriever({
        ...defaultConfig,
        timeout: 100,
        retries: 1,
      });

      await expect(retriever.getRelevantDocuments('test')).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network failure'));

      const retriever = new SeiznRetriever({ ...defaultConfig, retries: 1 });

      await expect(retriever.getRelevantDocuments('test')).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        message: 'Network failure',
      });
    });
  });

  describe('withConfig', () => {
    it('should create new instance with overridden config', () => {
      const retriever = new SeiznRetriever(defaultConfig);
      const newRetriever = retriever.withConfig({
        collectionId: 'new-collection',
        topK: 20,
      });

      expect(newRetriever).not.toBe(retriever);
      expect(newRetriever.getConfig().collectionId).toBe('new-collection');
      expect(newRetriever.getConfig().topK).toBe(20);

      // Original should be unchanged
      expect(retriever.getConfig().collectionId).toBe('test-collection');
      expect(retriever.getConfig().topK).toBe(4);
    });
  });

  describe('callback integration', () => {
    it('should call callback handlers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResponse),
      });

      const mockCallbacks = {
        getChild: vi.fn().mockReturnThis(),
        handleRetrieverStart: vi.fn(),
        handleRetrieverEnd: vi.fn(),
        handleRetrieverError: vi.fn(),
      };

      const retriever = new SeiznRetriever(defaultConfig);
      await retriever.getRelevantDocuments('test', mockCallbacks);

      expect(mockCallbacks.handleRetrieverStart).toHaveBeenCalledWith(
        { name: 'SeiznRetriever' },
        'test'
      );
      expect(mockCallbacks.handleRetrieverEnd).toHaveBeenCalled();
      expect(mockCallbacks.handleRetrieverError).not.toHaveBeenCalled();
    });

    it('should call error handler on failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      });

      const mockCallbacks = {
        getChild: vi.fn().mockReturnThis(),
        handleRetrieverStart: vi.fn(),
        handleRetrieverEnd: vi.fn(),
        handleRetrieverError: vi.fn(),
      };

      const retriever = new SeiznRetriever({ ...defaultConfig, retries: 1 });

      await expect(
        retriever.getRelevantDocuments('test', mockCallbacks)
      ).rejects.toThrow();

      expect(mockCallbacks.handleRetrieverError).toHaveBeenCalled();
    });
  });
});

describe('createSeiznRetriever', () => {
  it('should create SeiznRetriever instance', () => {
    const retriever = createSeiznRetriever({
      apiKey: 'test-key',
      collectionId: 'test-collection',
    });

    expect(retriever).toBeInstanceOf(SeiznRetriever);
  });
});
