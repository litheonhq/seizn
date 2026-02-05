/**
 * Multimodal Service
 *
 * Handles image-to-memory extraction using vision models.
 * Implements Mem0-style multimodal support.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import type {
  Asset,
  AssetLink,
  AssetStatus,
  AssetRelation,
  MultimodalIngestionInput,
  MultimodalIngestionResult,
} from './types';
import { createIngestionService, IngestionService } from './ingestion-service';
import { getLanguageProcessor } from './language-processor';
import { computeEmbedding } from '@/lib/embeddings';
import { detectPII } from '@/lib/security/pii-detector';
import { detectMultilingualPII } from '@/lib/langpack/pii';

// =============================================================================
// Multimodal Service
// =============================================================================

export class MultimodalService {
  private anthropic: Anthropic;
  private ingestionService: IngestionService;

  constructor(private supabase: SupabaseClient) {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.ingestionService = createIngestionService(supabase);
  }

  // ===========================================================================
  // Asset Management
  // ===========================================================================

  /**
   * Create an asset record
   */
  async createAsset(
    userId: string,
    input: {
      storageKey: string;
      filename?: string;
      mimeType: string;
      sizeBytes?: number;
      sha256Hash: string;
    }
  ): Promise<Asset> {
    const { data, error } = await this.supabase
      .from('spring_assets')
      .insert({
        user_id: userId,
        storage_provider: 'r2',
        storage_key: input.storageKey,
        filename: input.filename,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        sha256_hash: input.sha256Hash,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create asset: ${error.message}`);
    }

    return this.mapAssetFromDb(data);
  }

  /**
   * Get an asset by ID
   */
  async getAsset(assetId: string): Promise<Asset | null> {
    const { data, error } = await this.supabase
      .from('spring_assets')
      .select('*')
      .eq('id', assetId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get asset: ${error.message}`);
    }

    return this.mapAssetFromDb(data);
  }

  /**
   * Update asset status
   */
  async updateAssetStatus(
    assetId: string,
    status: AssetStatus,
    extras?: {
      extractedText?: string;
      extractedMetadata?: Record<string, unknown>;
      processingError?: string;
    }
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (status === 'processed') {
      updates.processed_at = new Date().toISOString();
    }

    if (extras?.extractedText !== undefined) {
      updates.extracted_text = extras.extractedText;
    }

    if (extras?.extractedMetadata) {
      updates.extracted_metadata = extras.extractedMetadata;
    }

    if (extras?.processingError) {
      updates.processing_error = extras.processingError;
    }

    const { error } = await this.supabase
      .from('spring_assets')
      .update(updates)
      .eq('id', assetId);

    if (error) {
      throw new Error(`Failed to update asset status: ${error.message}`);
    }
  }

  /**
   * Link an asset to a note
   */
  async linkAssetToNote(
    noteId: string,
    assetId: string,
    relation: AssetRelation = 'source',
    positionInfo?: Record<string, unknown>
  ): Promise<AssetLink> {
    const { data, error } = await this.supabase
      .from('spring_asset_links')
      .insert({
        note_id: noteId,
        asset_id: assetId,
        relation,
        position_info: positionInfo,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to link asset: ${error.message}`);
    }

    return {
      id: data.id,
      noteId: data.note_id,
      assetId: data.asset_id,
      relation: data.relation,
      positionInfo: data.position_info,
      createdAt: new Date(data.created_at),
    };
  }

  // ===========================================================================
  // Multimodal Ingestion
  // ===========================================================================

  /**
   * Process an image and extract memories
   */
  async processImage(
    userId: string,
    input: MultimodalIngestionInput
  ): Promise<MultimodalIngestionResult> {
    const startTime = Date.now();

    // Validate input
    if (!input.imageUrl && !input.imageBase64) {
      throw new Error('Either imageUrl or imageBase64 is required');
    }

    // Get image data
    let imageData: string;
    let mediaType: string;

    if (input.imageBase64) {
      imageData = input.imageBase64;
      mediaType = input.mimeType || 'image/png';
    } else {
      // Fetch image from URL
      const response = await fetch(input.imageUrl!);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      imageData = Buffer.from(buffer).toString('base64');
      mediaType = response.headers.get('content-type') || 'image/png';
    }

    // Calculate hash for deduplication
    const sha256Hash = createHash('sha256').update(imageData).digest('hex');

    // Check for existing asset with same hash
    const { data: existingAsset } = await this.supabase
      .from('spring_assets')
      .select('*')
      .eq('user_id', userId)
      .eq('sha256_hash', sha256Hash)
      .single();

    if (existingAsset && existingAsset.status === 'processed') {
      // Return existing extraction
      const { data: links } = await this.supabase
        .from('spring_asset_links')
        .select('note_id')
        .eq('asset_id', existingAsset.id);

      return {
        assetId: existingAsset.id,
        noteIds: (links || []).map((l) => l.note_id),
        extractedText: existingAsset.extracted_text || '',
        extractedFacts: existingAsset.extracted_metadata?.facts || [],
        processingMs: Date.now() - startTime,
      };
    }

    // Create asset record
    const asset = await this.createAsset(userId, {
      storageKey: `multimodal/${userId}/${sha256Hash.slice(0, 16)}`,
      filename: input.filename,
      mimeType: mediaType,
      sizeBytes: imageData.length,
      sha256Hash,
    });

    // Update status to processing
    await this.updateAssetStatus(asset.id, 'processing');

    try {
      // Extract information using Claude Vision
      const extraction = await this.extractFromImage(
        imageData,
        mediaType,
        input.extractionPrompt
      );

      // Check ingestion rules
      const extractedFacts: Array<{ content: string; type: string; confidence: number }> = [];
      const noteIds: string[] = [];

      const langProcessor = getLanguageProcessor();

      for (const fact of extraction.facts) {
        // Evaluate against ingestion rules
        const decision = await this.ingestionService.evaluateIngestion(userId, fact.content, {
          noteType: fact.type,
          categories: input.category ? [input.category] : undefined,
          extractionConfidence: fact.confidence,
        });

        if (decision.action === 'deny') {
          continue;
        }

        // Create memory note
        const content = decision.redactedContent || fact.content;
        const status = decision.action === 'store_as_candidate' ? 'candidate' : 'active';

        // --- Multilingual pipeline ---
        // 1. Language detection, normalization, tokenization
        const langResult = await langProcessor.processForStorage(content);

        // 2. Generate embedding for the content
        const embedding = await computeEmbedding(content, 'document');

        // 3. Canonical English translation (for non-English content)
        const canonical = await langProcessor.generateCanonical(
          content,
          langResult.language
        );

        // 4. Cross-script variants (zh-Hans/zh-Hant, romanized)
        const contentAlt = langProcessor.generateContentAlt(content, langResult.language);
        const hasContentAlt = Object.keys(contentAlt).length > 0;

        // 5. PII scanning (base + language-specific patterns)
        const basePiiResult = detectPII(content, { minConfidence: 0.7 });
        const langPiiResult = detectMultilingualPII(content, langResult.language, 0.7);
        const piiDetected = basePiiResult.found || langPiiResult.found;
        const piiTypes = Array.from(new Set([
          ...basePiiResult.types,
          ...langPiiResult.types,
        ]));

        const { data: note, error } = await this.supabase
          .from('spring_memory_notes')
          .insert({
            user_id: userId,
            content,
            type: fact.type || input.noteType || 'fact',
            status,
            scope: 'user',
            privacy_class: 'internal',
            category: input.category,
            tags: input.tags,
            extraction_confidence: fact.confidence,
            embedding,
            // Multilingual columns
            language: langResult.language,
            script_type: langResult.scriptType,
            language_confidence: langResult.languageConfidence,
            lex_tokens: langResult.lexTokens,
            phonetic_tokens: langResult.phoneticTokens,
            content_canonical_en: canonical?.contentCanonicalEn || null,
            embedding_canonical: canonical?.embeddingCanonical || null,
            content_alt: hasContentAlt ? contentAlt : {},
            metadata: {
              ...input.metadata,
              source: 'multimodal',
              assetId: asset.id,
              pii_detected: piiDetected,
              pii_types: piiTypes,
              pii_count: basePiiResult.count + langPiiResult.count,
              pii_max_confidence: Math.max(
                basePiiResult.maxConfidence,
                langPiiResult.maxConfidence
              ),
            },
          })
          .select()
          .single();

        if (!error && note) {
          noteIds.push(note.id);
          extractedFacts.push(fact);

          // Link asset to note
          await this.linkAssetToNote(note.id, asset.id, 'source');
        }
      }

      // Update asset with extraction results
      await this.updateAssetStatus(asset.id, 'processed', {
        extractedText: extraction.text,
        extractedMetadata: { facts: extraction.facts },
      });

      return {
        assetId: asset.id,
        noteIds,
        extractedText: extraction.text,
        extractedFacts,
        processingMs: Date.now() - startTime,
      };
    } catch (error) {
      // Update asset with error
      await this.updateAssetStatus(asset.id, 'failed', {
        processingError: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Extract information from an image using Claude Vision
   */
  private async extractFromImage(
    imageData: string,
    mediaType: string,
    customPrompt?: string
  ): Promise<{
    text: string;
    facts: Array<{ content: string; type: string; confidence: number }>;
  }> {
    const systemPrompt = `You are an expert at extracting factual information from images.
Your task is to identify discrete, storable facts from the image content.

For each fact, determine:
1. The content (a clear, standalone statement)
2. The type (fact, preference, instruction, episode, procedure, relationship)
3. Your confidence (0.0 to 1.0)

Focus on:
- Text content (documents, notes, captions)
- Diagrams and charts (extract key data points)
- Visual information (objects, people, places)
- Contextual information (dates, locations, events)

Ignore:
- Decorative elements
- Advertisements or watermarks
- Personally identifiable information (faces, IDs, etc.)`;

    const userPrompt = customPrompt ||
      `Extract all meaningful facts from this image. Return a JSON object with:
{
  "text": "Full transcription of any visible text",
  "facts": [
    {"content": "...", "type": "fact|preference|instruction|episode|procedure|relationship", "confidence": 0.9}
  ]
}

Only return valid JSON.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data: imageData,
              },
            },
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        },
      ],
      system: systemPrompt,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from vision model');
    }

    try {
      const result = JSON.parse(content.text);
      return {
        text: result.text || '',
        facts: result.facts || [],
      };
    } catch {
      // If parsing fails, treat the response as plain text extraction
      return {
        text: content.text,
        facts: [
          {
            content: content.text,
            type: 'fact',
            confidence: 0.7,
          },
        ],
      };
    }
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private mapAssetFromDb(row: Record<string, unknown>): Asset {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      storageProvider: row.storage_provider as 'r2' | 's3' | 'local',
      storageKey: row.storage_key as string,
      filename: row.filename as string | undefined,
      mimeType: row.mime_type as string,
      sizeBytes: row.size_bytes as number | undefined,
      sha256Hash: row.sha256_hash as string,
      status: row.status as AssetStatus,
      processingError: row.processing_error as string | undefined,
      extractedText: row.extracted_text as string | undefined,
      extractedMetadata: row.extracted_metadata as Record<string, unknown> | undefined,
      createdAt: new Date(row.created_at as string),
      processedAt: row.processed_at ? new Date(row.processed_at as string) : undefined,
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createMultimodalService(supabase: SupabaseClient): MultimodalService {
  return new MultimodalService(supabase);
}
