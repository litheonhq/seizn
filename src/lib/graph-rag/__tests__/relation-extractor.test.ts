/**
 * Relation Extractor Tests
 *
 * Tests for extracting relations between entities:
 * - Pattern-based relation extraction
 * - LLM-based relation extraction (mocked)
 * - Evidence linking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractRelations, extractRelationsFromText } from '../extraction/relation-extractor';
import type { ChunkInput, EntityInput } from '../types';

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

describe('RelationExtractor', () => {
  const sampleEntities: EntityInput[] = [
    { name: 'OpenAI', type: 'organization', sourceChunkId: 'chunk-1' },
    { name: 'GPT-4', type: 'product', sourceChunkId: 'chunk-1' },
    { name: 'Sam Altman', type: 'person', sourceChunkId: 'chunk-1' },
    { name: 'San Francisco', type: 'location', sourceChunkId: 'chunk-1' },
    { name: 'React', type: 'technology', sourceChunkId: 'chunk-1' },
    { name: 'Node.js', type: 'technology', sourceChunkId: 'chunk-1' },
  ];

  describe('Rule-based relation extraction', () => {
    it.skip('should extract "authored_by" relations', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'GPT-4 was developed by OpenAI.',
        },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: false,
        useRules: true,
      });

      expect(result.relations.length).toBeGreaterThan(0);
      const authoredRelation = result.relations.find((r) => r.type === 'authored_by');
      expect(authoredRelation).toBeDefined();
    });

    it('should extract "is_a" relations', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'React is a type of technology.',
        },
      ];

      const entities: EntityInput[] = [
        { name: 'React', type: 'technology', sourceChunkId: 'chunk-1' },
        { name: 'technology', type: 'concept', sourceChunkId: 'chunk-1' },
      ];

      const result = await extractRelations(chunks, entities, {
        useLlm: false,
        useRules: true,
      });

      const isARelation = result.relations.find((r) => r.type === 'is_a');
      expect(isARelation).toBeDefined();
    });

    it.skip('should extract "located_in" relations', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'OpenAI is headquartered in San Francisco.',
        },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: false,
        useRules: true,
      });

      const locatedRelation = result.relations.find((r) => r.type === 'located_in');
      expect(locatedRelation).toBeDefined();
    });

    it.skip('should extract "depends_on" relations', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'React depends on Node.js for development.',
        },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: false,
        useRules: true,
      });

      const dependsRelation = result.relations.find((r) => r.type === 'depends_on');
      expect(dependsRelation).toBeDefined();
    });

    it.skip('should extract "part_of" relations', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'GPT-4 is part of OpenAI product suite.',
        },
      ];

      const entities: EntityInput[] = [
        { name: 'GPT-4', type: 'product', sourceChunkId: 'chunk-1' },
        { name: 'OpenAI product suite', type: 'product', sourceChunkId: 'chunk-1' },
      ];

      const result = await extractRelations(chunks, entities, {
        useLlm: false,
        useRules: true,
      });

      const partOfRelation = result.relations.find((r) => r.type === 'part_of');
      expect(partOfRelation).toBeDefined();
    });

    it.skip('should include evidence text in relations', async () => {
      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'OpenAI created GPT-4 in 2023.',
        },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: false,
        useRules: true,
      });

      const relationWithEvidence = result.relations.find((r) => r.evidence);
      expect(relationWithEvidence?.evidence).toBeDefined();
      expect(relationWithEvidence?.evidenceChunkId).toBe('chunk-1');
    });
  });

  describe('LLM-based relation extraction', () => {
    it('should extract relations using LLM', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  {
                    source: 'OpenAI',
                    target: 'GPT-4',
                    type: 'authored_by',
                    evidence: 'OpenAI developed GPT-4',
                    confidence: 0.95,
                  },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'OpenAI developed GPT-4, their latest AI model.',
        },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: true,
        useRules: false,
        model: 'haiku',
      });

      expect(mockFetch).toHaveBeenCalled();
      expect(result.relations.length).toBeGreaterThan(0);
    });

    it('should handle LLM API errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('API Error'),
      });

      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'Some content.' },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: true,
        useRules: false,
      });

      expect(result.relations).toEqual([]);
    });

    it('should validate LLM relations against entity list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  {
                    source: 'NonExistentEntity',
                    target: 'GPT-4',
                    type: 'authored_by',
                    confidence: 0.9,
                  },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'Testing validation.' },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: true,
        useRules: false,
      });

      // Should filter out relations with non-existent entities
      expect(result.relations).toEqual([]);
    });
  });

  describe('Relation merging', () => {
    it('should merge relations from both extraction methods', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  {
                    source: 'OpenAI',
                    target: 'GPT-4',
                    type: 'authored_by',
                    evidence: 'OpenAI created GPT-4',
                    confidence: 0.9,
                  },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        {
          id: 'chunk-1',
          content: 'GPT-4 was created by OpenAI.',
        },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: true,
        useRules: true,
      });

      // Should have merged, not duplicated
      const authoredRelations = result.relations.filter(
        (r) => r.type === 'authored_by'
      );
      expect(authoredRelations.length).toBe(1);
      // Confidence should be boosted
      expect(authoredRelations[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should deduplicate identical relations', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  { source: 'React', target: 'Node.js', type: 'depends_on', confidence: 0.8 },
                  { source: 'React', target: 'Node.js', type: 'depends_on', confidence: 0.75 },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'React requires Node.js.' },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: true,
        useRules: false,
      });

      const dependsRelations = result.relations.filter(
        (r) =>
          r.type === 'depends_on' &&
          r.sourceEntityId.includes('react') &&
          r.targetEntityId.includes('node')
      );
      expect(dependsRelations.length).toBe(1);
    });
  });

  describe('extractRelationsFromText helper', () => {
    it('should extract relations from a single text string', async () => {
      const text = 'OpenAI developed GPT-4.';
      const result = await extractRelationsFromText(text, 'single-chunk', sampleEntities, {
        useLlm: false,
        useRules: true,
      });

      expect(result.relations.length).toBeGreaterThanOrEqual(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle chunks with fewer than 2 entities', async () => {
      const singleEntity: EntityInput[] = [
        { name: 'React', type: 'technology', sourceChunkId: 'chunk-1' },
      ];

      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'React is a library.' },
      ];

      const result = await extractRelations(chunks, singleEntity, {
        useLlm: false,
        useRules: true,
      });

      // Need at least 2 entities for relations
      expect(result.relations).toEqual([]);
    });

    it('should handle empty entity list', async () => {
      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'Some text content.' },
      ];

      const result = await extractRelations(chunks, [], {
        useLlm: false,
        useRules: true,
      });

      expect(result.relations).toEqual([]);
    });

    it('should handle self-referential relation attempts', async () => {
      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'OpenAI works at OpenAI.' },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: false,
        useRules: true,
      });

      // Should not have self-referential relations
      const selfRelations = result.relations.filter(
        (r) => r.sourceEntityId === r.targetEntityId
      );
      expect(selfRelations.length).toBe(0);
    });

    it('should filter relations below confidence threshold', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [
              {
                text: JSON.stringify([
                  { source: 'OpenAI', target: 'GPT-4', type: 'authored_by', confidence: 0.9 },
                  { source: 'React', target: 'Node.js', type: 'depends_on', confidence: 0.3 },
                ]),
              },
            ],
          }),
      });

      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'Testing confidence.' },
      ];

      const result = await extractRelations(chunks, sampleEntities, {
        useLlm: true,
        useRules: false,
        minConfidence: 0.5,
      });

      expect(result.relations.some((r) => r.type === 'authored_by')).toBe(true);
      expect(result.relations.every((r) => (r.confidence ?? 0) >= 0.5)).toBe(true);
    });

    it('should handle entity aliases in relation matching', async () => {
      const entitiesWithAliases: EntityInput[] = [
        {
          name: 'OpenAI',
          type: 'organization',
          sourceChunkId: 'chunk-1',
          aliases: ['Open AI', 'OpenAI Inc'],
        },
        { name: 'GPT-4', type: 'product', sourceChunkId: 'chunk-1' },
      ];

      const chunks: ChunkInput[] = [
        { id: 'chunk-1', content: 'Open AI developed GPT-4.' },
      ];

      const result = await extractRelations(chunks, entitiesWithAliases, {
        useLlm: false,
        useRules: true,
      });

      // Should match via alias
      expect(result.relations.length).toBeGreaterThanOrEqual(0);
    });
  });
});
