/**
 * Entity Extractor Tests
 *
 * Tests for the entity extraction system including:
 * - Pattern-based NER extraction
 * - LLM-based extraction (mocked)
 * - Entity merging and deduplication
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractEntities, extractEntitiesFromText } from '../extraction/entity-extractor';
import type { ChunkInput, EntityType } from '../types';

// Mock fetch for LLM API calls
const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('EntityExtractor', () => {
  describe('extractWithNER (rule-based extraction)', () => {
    it('should extract technology entities from text', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'We built the application using React and TypeScript with PostgreSQL database.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['technology'],
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const entityNames = result.entities.map((e) => e.name.toLowerCase());
      expect(entityNames).toContain('react');
      expect(entityNames).toContain('typescript');
      expect(entityNames).toContain('postgresql');
    });

    it('should extract organization entities with suffixes', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-2',
          content: 'OpenAI Inc. announced a partnership with Microsoft Corporation and Google LLC.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['organization'],
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const entityNames = result.entities.map((e) => e.name);
      expect(entityNames.some((n) => n.includes('OpenAI'))).toBe(true);
    });

    it('should extract Korean organization names', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-3',
          content: '주식회사 카카오와 네이버 주식회사가 협력했습니다.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['organization'],
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities.some((e) => e.name.includes('카카오'))).toBe(true);
    });

    it('should extract method entities', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-4',
          content: 'We follow Agile methodology with Scrum framework and CI/CD practices.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['method'],
      });

      expect(result.entities.length).toBeGreaterThan(0);
      const entityNames = result.entities.map((e) => e.name.toLowerCase());
      expect(entityNames.some((n) => n.includes('agile') || n.includes('scrum') || n.includes('ci/cd'))).toBe(true);
    });

    it('should extract date/event entities', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-5',
          content: 'The project started on 2024-01-15 with v2.0.0 release launch.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['event'],
      });

      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should set confidence to 0.7 for rule-based matches', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-6',
          content: 'Using Python for backend development.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['technology'],
      });

      const pythonEntity = result.entities.find((e) => e.name.toLowerCase() === 'python');
      expect(pythonEntity).toBeDefined();
      expect(pythonEntity?.confidence).toBe(0.7);
    });
  });

  describe('extractWithLLM (LLM-based extraction)', () => {
    it('should extract entities using LLM when API key is set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  {
                    name: 'Anthropic',
                    type: 'organization',
                    aliases: ['Anthropic AI'],
                    description: 'AI safety company',
                    confidence: 0.95,
                  },
                  {
                    name: 'Claude',
                    type: 'product',
                    aliases: [],
                    description: 'AI assistant',
                    confidence: 0.9,
                  },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-7',
          content: 'Anthropic developed Claude, an AI assistant focused on safety.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: false,
        model: 'haiku',
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.entities.length).toBe(2);
      expect(result.entities.some((e) => e.name === 'Anthropic')).toBe(true);
      expect(result.entities.some((e) => e.name === 'Claude')).toBe(true);
    });

    it('should handle LLM API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('API Error'),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-8',
          content: 'Some text content.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: false,
      });

      // Should return empty when LLM fails
      expect(result.entities).toEqual([]);
    });

    it('should skip LLM extraction when API key is not set', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', '');

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-9',
          content: 'Some text content.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: false,
      });

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.entities).toEqual([]);
    });
  });

  describe('mergeEntities (deduplication)', () => {
    it('should merge entities from both rule and LLM extraction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  {
                    name: 'React',
                    type: 'technology',
                    aliases: ['React.js', 'ReactJS'],
                    description: 'JavaScript library',
                    confidence: 0.9,
                  },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-10',
          content: 'We use React for the frontend application.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: true,
      });

      // Should have merged entities, not duplicates
      const reactEntities = result.entities.filter(
        (e) => e.name.toLowerCase() === 'react'
      );
      expect(reactEntities.length).toBe(1);
      // Confidence should be boosted when both methods find the same entity
      expect(reactEntities[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should deduplicate entities with same name and type', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  { name: 'Python', type: 'technology', confidence: 0.85 },
                  { name: 'Python', type: 'technology', confidence: 0.8 },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-11',
          content: 'Python is used for Python scripting.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: true,
      });

      const pythonEntities = result.entities.filter(
        (e) => e.name.toLowerCase() === 'python'
      );
      expect(pythonEntities.length).toBe(1);
    });

    it('should filter entities below minimum confidence threshold', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  { name: 'HighConf', type: 'technology', confidence: 0.9 },
                  { name: 'LowConf', type: 'technology', confidence: 0.3 },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-12',
          content: 'Testing confidence filtering.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: false,
        minConfidence: 0.5,
      });

      expect(result.entities.some((e) => e.name === 'HighConf')).toBe(true);
      expect(result.entities.some((e) => e.name === 'LowConf')).toBe(false);
    });
  });

  describe('extractEntitiesFromText (single text helper)', () => {
    it('should extract entities from a single text string', async () => {
      const text = 'Node.js and MongoDB are used in this project.';
      const result = await extractEntitiesFromText(text, 'single-chunk', {
        useLlm: false,
        useRules: true,
        entityTypes: ['technology'],
      });

      expect(result.entities.length).toBeGreaterThan(0);
      expect(result.entities[0].sourceChunkId).toBe('single-chunk');
    });

    it('should return processing time', async () => {
      const text = 'Testing processing time measurement.';
      const result = await extractEntitiesFromText(text, 'time-chunk', {
        useLlm: false,
        useRules: true,
      });

      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'empty-chunk',
          content: '',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
      });

      expect(result.entities).toEqual([]);
    });

    it('should handle text with no extractable entities', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'no-entities',
          content: 'The quick brown fox jumps over the lazy dog.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['technology'],
      });

      expect(result.entities).toEqual([]);
    });

    it('should respect maxEntitiesPerChunk limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify(
                  Array.from({ length: 100 }, (_, i) => ({
                    name: `Entity${i}`,
                    type: 'concept',
                    confidence: 0.8,
                  }))
                ),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'many-entities',
          content: 'Text with many entities.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: true,
        useRules: false,
        maxEntitiesPerChunk: 10,
      });

      expect(result.entities.length).toBeLessThanOrEqual(10);
    });

    it('should handle multiple chunks', async () => {
      const chunks: ChunkInput[] = [
        { id: 'chunk-a', content: 'React is a JavaScript library.' },
        { id: 'chunk-b', content: 'Python is a programming language.' },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['technology'],
      });

      expect(result.entities.some((e) => e.sourceChunkId === 'chunk-a')).toBe(true);
      expect(result.entities.some((e) => e.sourceChunkId === 'chunk-b')).toBe(true);
    });

    it('should handle special characters in text', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'special-chars',
          content: 'Using C++ and C# for development. Also Node.js v18.0.',
        },
      ];

      const result = await extractEntities(chunks, {
        useLlm: false,
        useRules: true,
        entityTypes: ['technology'],
      });

      // Should still extract Node.js
      expect(result.entities.some((e) => e.name.includes('Node.js'))).toBe(true);
    });
  });
});
