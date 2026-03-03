/**
 * Multimodal Service
 *
 * Handles image-to-memory extraction using vision models.
 * Implements Mem0-style multimodal support.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
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

const MAX_IMAGE_BYTES = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_MAX_BYTES || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 5 * 1024 * 1024;
})();

const FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_FETCH_TIMEOUT_MS || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 10000;
})();

const MAX_IMAGE_REDIRECTS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_MAX_REDIRECTS || '', 10);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 3;
})();

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254']);
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

function normalizeMimeType(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.split(';')[0].trim().toLowerCase();
}

function stripUrlQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

function verifyImageMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  return false;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((v) => Number.parseInt(v, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function normalizeIpCandidate(address: string): string {
  const lowered = address.trim().toLowerCase();
  const zoneIndex = lowered.indexOf('%');
  return zoneIndex >= 0 ? lowered.slice(0, zoneIndex) : lowered;
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeIpCandidate(address);
  const version = net.isIP(normalized);
  if (!version) return true;

  if (version === 4) {
    return isBlockedIpv4(normalized);
  }

  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe80:')) return true;
  if (normalized.startsWith('ff')) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) {
      return isBlockedIpv4(mapped);
    }
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function normalizeAddressSet(addresses: string[]): string[] {
  return Array.from(new Set(addresses.map(normalizeIpCandidate))).sort();
}

function isSameAddressSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function validateRemoteImageUrl(
  urlString: string,
  resolutionPinning?: Map<string, string[]>
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('imageUrl must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('imageUrl must use https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('imageUrl must not include credentials');
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname || isBlockedHostname(hostname)) {
    throw new Error('imageUrl hostname is not allowed');
  }

  if (net.isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error('imageUrl resolves to a private or internal IP');
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      throw new Error('imageUrl hostname could not be resolved');
    }
    const normalized = normalizeAddressSet(addresses.map((record) => record.address));
    for (const record of addresses) {
      if (isBlockedIpAddress(record.address)) {
        throw new Error('imageUrl resolves to a private or internal IP');
      }
    }
    if (resolutionPinning) {
      const pinned = resolutionPinning.get(hostname);
      if (!pinned) {
        resolutionPinning.set(hostname, normalized);
      } else if (!isSameAddressSet(pinned, normalized)) {
        throw new Error('imageUrl hostname resolution changed during fetch');
      }
    }
  } catch (error) {
    if (error instanceof Error && /(private or internal ip|resolution changed)/i.test(error.message)) {
      throw error;
    }
    throw new Error('imageUrl hostname could not be resolved');
  }

  return parsed;
}

async function readResponseBodyLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new Error(`Image too large (max ${maxBytes} bytes)`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;

    total += value.length;
    if (total > maxBytes) {
      await reader.cancel('Image too large');
      throw new Error(`Image too large (max ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function fetchRemoteImageAsBase64(imageUrl: string): Promise<{
  imageBase64: string;
  mimeType: string;
  resolvedUrl: string;
  sizeBytes: number;
}> {
  const resolutionPinning = new Map<string, string[]>();
  const validated = await validateRemoteImageUrl(imageUrl, resolutionPinning);
  let requestUrl = validated.toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response | null = null;

  try {
    for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount += 1) {
      await validateRemoteImageUrl(requestUrl, resolutionPinning);
      response = await fetch(requestUrl, { signal: controller.signal, redirect: 'manual' });
      await validateRemoteImageUrl(requestUrl, resolutionPinning);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error('imageUrl redirect is missing location');
        }
        if (redirectCount >= MAX_IMAGE_REDIRECTS) {
          throw new Error('Too many redirects while fetching imageUrl');
        }
        const redirected = new URL(location, requestUrl).toString();
        const validatedRedirect = await validateRemoteImageUrl(redirected, resolutionPinning);
        requestUrl = validatedRedirect.toString();
        continue;
      }
      break;
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Timed out while fetching imageUrl');
    }
    if (error instanceof Error && error.message) {
      throw error;
    }
    throw new Error('Failed to fetch imageUrl');
  } finally {
    clearTimeout(timeout);
  }

  if (!response || !response.ok) {
    throw new Error(`Failed to fetch imageUrl (${response?.status ?? 0})`);
  }

  const headerMime = normalizeMimeType(response.headers.get('content-type'));
  if (headerMime && !headerMime.startsWith('image/')) {
    throw new Error('imageUrl must point to an image resource');
  }
  const mimeType = headerMime || 'image/png';
  if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image mime type. Allowed: ${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}`);
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${MAX_IMAGE_BYTES} bytes)`);
  }

  const bytes = await readResponseBodyLimited(response, MAX_IMAGE_BYTES);
  if (bytes.length === 0) {
    throw new Error('Decoded image is empty');
  }
  if (!verifyImageMagicBytes(bytes)) {
    throw new Error('Image binary does not match any known image signature');
  }

  const imageBase64 = Buffer.from(bytes).toString('base64');

  return {
    imageBase64,
    mimeType,
    resolvedUrl: requestUrl,
    sizeBytes: bytes.length,
  };
}

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
    let imageBytes: Uint8Array;
    let sourceUrl: string | undefined;

    if (input.imageBase64) {
      let base64Payload = input.imageBase64;
      const dataUrlMatch = base64Payload.match(/^data:([^;]+);base64,(.+)$/i);
      if (dataUrlMatch) {
        mediaType = normalizeMimeType(input.mimeType || dataUrlMatch[1]) || 'image/png';
        base64Payload = dataUrlMatch[2];
      } else {
        mediaType = normalizeMimeType(input.mimeType) || 'image/png';
      }
      if (!ALLOWED_IMAGE_MIME_TYPES.has(mediaType)) {
        throw new Error(`Unsupported image mime type. Allowed: ${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}`);
      }
      const compact = base64Payload.replace(/\s/g, '');
      const estimatedBytes = Math.floor((compact.length * 3) / 4);
      if (estimatedBytes > MAX_IMAGE_BYTES) {
        throw new Error(`Image too large (max ${MAX_IMAGE_BYTES} bytes)`);
      }

      imageBytes = Uint8Array.from(Buffer.from(compact, 'base64'));
      if (imageBytes.length === 0) {
        throw new Error('Decoded image is empty');
      }
      if (imageBytes.length > MAX_IMAGE_BYTES) {
        throw new Error(`Image too large (max ${MAX_IMAGE_BYTES} bytes)`);
      }
      if (!verifyImageMagicBytes(imageBytes)) {
        throw new Error('Image binary does not match any known image signature');
      }
      imageData = Buffer.from(imageBytes).toString('base64');
    } else {
      // Fetch image from URL
      const fetched = await fetchRemoteImageAsBase64(input.imageUrl!);
      imageData = fetched.imageBase64;
      mediaType = fetched.mimeType;
      imageBytes = Uint8Array.from(Buffer.from(imageData, 'base64'));
      if (!verifyImageMagicBytes(imageBytes)) {
        throw new Error('Image binary does not match any known image signature');
      }
      sourceUrl = fetched.resolvedUrl;
    }

    // Calculate hash for deduplication
    const sha256Hash = createHash('sha256').update(imageBytes).digest('hex');

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
      sizeBytes: imageBytes.length,
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
        extractedMetadata: { facts: extraction.facts, source_url: sourceUrl ? stripUrlQuery(sourceUrl) : null },
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
