/**
 * Note Builder Service (A-MEM)
 *
 * Implements A-MEM-style note construction with automatic metadata extraction.
 * Extracts title, summary, keywords, categories, and entities from memory content.
 *
 * @module spring/memory-v4/note-builder
 */

import Anthropic from '@anthropic-ai/sdk';
import { getLanguageProcessor } from './language-processor';

// =============================================================================
// Types
// =============================================================================

export interface NoteBuilderConfig {
  /** Extract a concise title */
  extractTitle: boolean;
  /** Extract a summary (1-2 sentences) */
  extractSummary: boolean;
  /** Extract keywords/key phrases */
  extractKeywords: boolean;
  /** Suggest categories */
  extractCategories: boolean;
  /** Extract named entities */
  extractEntities: boolean;
  /** Minimum confidence threshold for extraction (0-1) */
  minConfidence: number;
  /** Maximum keywords to extract */
  maxKeywords: number;
  /** Maximum entities to extract */
  maxEntities: number;
  /** LLM model to use */
  model: 'haiku' | 'sonnet';
}

export interface ExtractedEntity {
  /** Entity name */
  name: string;
  /** Entity type (person, organization, technology, etc.) */
  type: string;
  /** Confidence score (0-1) */
  confidence: number;
}

export interface ExtractedMetadata {
  /** Concise title for the memory */
  title: string;
  /** One-sentence summary */
  summary: string;
  /** Key terms and phrases */
  keywords: string[];
  /** Suggested category tags */
  categories: string[];
  /** Extracted named entities */
  entities: ExtractedEntity[];
  /** Suggested memory type (fact, preference, episode, procedure, relationship) */
  suggestedType: 'fact' | 'preference' | 'episode' | 'procedure' | 'relationship' | 'instruction';
  /** Overall extraction confidence */
  confidence: number;
  /** Processing time in ms */
  processingMs: number;
}

export interface BatchBuildResult {
  results: ExtractedMetadata[];
  totalProcessingMs: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ index: number; error: string }>;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: NoteBuilderConfig = {
  extractTitle: true,
  extractSummary: true,
  extractKeywords: true,
  extractCategories: true,
  extractEntities: true,
  minConfidence: 0.5,
  maxKeywords: 10,
  maxEntities: 10,
  model: 'haiku',
};

const NOTE_BUILDER_PROMPT = `You are an expert memory analyzer. Extract structured metadata from the provided content.

## Output Schema
Return a valid JSON object with these fields:
{
  "title": "concise title (5-10 words max)",
  "summary": "one-sentence summary capturing the key information",
  "keywords": ["keyword1", "keyword2", ...], // 3-10 key terms/phrases
  "categories": ["category1", "category2"], // 1-3 semantic categories
  "entities": [
    {"name": "Entity Name", "type": "person|organization|technology|location|product|concept", "confidence": 0.9}
  ],
  "suggestedType": "fact|preference|episode|procedure|relationship|instruction",
  "confidence": 0.85 // overall extraction confidence (0-1)
}

## Guidelines
- Title: Brief, descriptive, captures the main topic
- Summary: One complete sentence that conveys the core information
- Keywords: Specific terms that would help retrieve this memory later
- Categories: High-level semantic categories (e.g., "work", "preferences", "technical", "personal")
- Entities: Only clearly identifiable named entities with types
- suggestedType meanings:
  - "fact": A factual statement or piece of information
  - "preference": User preference, opinion, or taste
  - "episode": An event or experience with temporal context
  - "procedure": A how-to, process, or instruction set
  - "relationship": Information about relationships between entities
  - "instruction": A directive or rule to follow
- Confidence: How reliable the extraction is (higher for clear content)

## Rules
1. Extract only what's clearly present in the content
2. Don't invent or assume information
3. Keep keywords relevant and specific
4. Categories should be broad semantic groupings
5. If content is unclear, set lower confidence

Return ONLY valid JSON. No markdown, no explanation.`;

// =============================================================================
// Note Builder Service
// =============================================================================

export class NoteBuilderService {
  private anthropic: Anthropic;
  private config: NoteBuilderConfig;

  constructor(config?: Partial<NoteBuilderConfig>) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build structured metadata from content
   */
  async buildNote(
    content: string,
    config?: Partial<NoteBuilderConfig>
  ): Promise<ExtractedMetadata> {
    const startTime = Date.now();
    const finalConfig = { ...this.config, ...config };

    // Truncate if too long
    const maxChars = 6000;
    const truncatedContent = content.length > maxChars
      ? content.slice(0, maxChars) + '...[truncated]'
      : content;

    try {
      const modelId = finalConfig.model === 'haiku'
        ? 'claude-3-5-haiku-20241022'
        : 'claude-3-5-sonnet-20241022';

      const response = await this.anthropic.messages.create({
        model: modelId,
        max_tokens: 1024,
        system: NOTE_BUILDER_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Extract metadata from this content:\n\n${truncatedContent}`,
          },
        ],
      });

      const textContent = response.content[0];
      if (textContent.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const extracted = JSON.parse(textContent.text) as {
        title: string;
        summary: string;
        keywords: string[];
        categories: string[];
        entities: ExtractedEntity[];
        suggestedType: ExtractedMetadata['suggestedType'];
        confidence: number;
      };

      // Apply config filters
      const result: ExtractedMetadata = {
        title: finalConfig.extractTitle ? extracted.title || '' : '',
        summary: finalConfig.extractSummary ? extracted.summary || '' : '',
        keywords: finalConfig.extractKeywords
          ? (extracted.keywords || []).slice(0, finalConfig.maxKeywords)
          : [],
        categories: finalConfig.extractCategories
          ? extracted.categories || []
          : [],
        entities: finalConfig.extractEntities
          ? (extracted.entities || [])
              .filter((e) => e.confidence >= finalConfig.minConfidence)
              .slice(0, finalConfig.maxEntities)
          : [],
        suggestedType: extracted.suggestedType || 'fact',
        confidence: Math.min(1, Math.max(0, extracted.confidence || 0.7)),
        processingMs: Date.now() - startTime,
      };

      return result;
    } catch (error) {
      console.error('NoteBuilder extraction failed:', error);

      // Return minimal fallback
      return {
        title: this.generateFallbackTitle(content),
        summary: content.slice(0, 200),
        keywords: this.extractBasicKeywords(content),
        categories: [],
        entities: [],
        suggestedType: 'fact',
        confidence: 0.3,
        processingMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build notes in batch for efficiency
   */
  async buildNotes(
    contents: string[],
    config?: Partial<NoteBuilderConfig>
  ): Promise<BatchBuildResult> {
    const startTime = Date.now();
    const results: ExtractedMetadata[] = [];
    const errors: Array<{ index: number; error: string }> = [];

    // Process in parallel batches
    const batchSize = 5;
    for (let i = 0; i < contents.length; i += batchSize) {
      const batch = contents.slice(i, i + batchSize);
      const batchPromises = batch.map((content, idx) =>
        this.buildNote(content, config)
          .then((result) => ({ index: i + idx, result, error: null }))
          .catch((err) => ({
            index: i + idx,
            result: null,
            error: err instanceof Error ? err.message : 'Unknown error',
          }))
      );

      const batchResults = await Promise.all(batchPromises);

      for (const item of batchResults) {
        if (item.result) {
          results[item.index] = item.result;
        } else {
          errors.push({ index: item.index, error: item.error! });
          // Add fallback for failed extraction
          results[item.index] = {
            title: '',
            summary: '',
            keywords: [],
            categories: [],
            entities: [],
            suggestedType: 'fact',
            confidence: 0,
            processingMs: 0,
          };
        }
      }
    }

    return {
      results,
      totalProcessingMs: Date.now() - startTime,
      successCount: contents.length - errors.length,
      errorCount: errors.length,
      errors,
    };
  }

  /**
   * Extract keywords from content without LLM (fallback)
   */
  async buildNoteFast(content: string): Promise<Partial<ExtractedMetadata>> {
    const startTime = Date.now();

    return {
      title: this.generateFallbackTitle(content),
      keywords: this.extractBasicKeywords(content),
      suggestedType: this.inferType(content),
      confidence: 0.5,
      processingMs: Date.now() - startTime,
    };
  }

  /**
   * Generate a fallback title from content
   */
  private generateFallbackTitle(content: string): string {
    // Take first line or first sentence
    const firstLine = content.split('\n')[0]?.trim() || '';
    const firstSentence = content.split(/[.!?]/)[0]?.trim() || '';

    const candidate = firstLine.length < 60 ? firstLine : firstSentence;

    if (candidate.length <= 60) {
      return candidate;
    }

    // Truncate at word boundary
    const truncated = candidate.slice(0, 57);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + '...';
  }

  /**
   * Extract basic keywords without LLM (multilingual-aware)
   */
  private extractBasicKeywords(content: string): string[] {
    const langProcessor = getLanguageProcessor();
    return langProcessor.extractKeywordsMultilingual(content);
  }

  /**
   * Infer memory type from content patterns
   */
  private inferType(content: string): ExtractedMetadata['suggestedType'] {
    const lower = content.toLowerCase();

    // Check for preference indicators
    if (
      /\b(prefer|like|love|hate|dislike|favorite|favourite)\b/.test(lower) ||
      /\b(i\s+want|i\s+need|i\s+think|i\s+believe|i\s+feel)\b/.test(lower)
    ) {
      return 'preference';
    }

    // Check for procedure/instruction indicators
    if (
      /\b(step|how\s+to|first|then|next|finally|follow|instructions?)\b/.test(lower) ||
      /^\d+\.\s/.test(content)
    ) {
      return 'procedure';
    }

    // Check for episode/event indicators
    if (
      /\b(yesterday|today|last\s+(week|month|year)|ago|recently|when\s+i)\b/.test(lower) ||
      /\b(happened|occurred|event|experience)\b/.test(lower)
    ) {
      return 'episode';
    }

    // Check for relationship indicators
    if (
      /\b(is\s+a|is\s+the|works\s+(at|for)|belongs\s+to|related\s+to|part\s+of)\b/.test(lower)
    ) {
      return 'relationship';
    }

    // Check for instruction/directive indicators
    if (
      /\b(always|never|must|should|don't|do\s+not|remember\s+to)\b/.test(lower)
    ) {
      return 'instruction';
    }

    // Default to fact
    return 'fact';
  }

  /**
   * Update config
   */
  setConfig(config: Partial<NoteBuilderConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createNoteBuilderService(
  config?: Partial<NoteBuilderConfig>
): NoteBuilderService {
  return new NoteBuilderService(config);
}
