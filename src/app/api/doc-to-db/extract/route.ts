/**
 * POST /api/doc-to-db/extract
 *
 * Extract structured data from document content.
 * Identifies tables, lists, key-value pairs, and other structures.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  extractStructures,
  saveExtractedStructures,
  type ExtractionOptions,
  type ExtractResponse,
} from '@/lib/doc-to-db';

// Valid structure types for extraction
const _VALID_STRUCTURE_TYPES = ['table', 'list', 'key_value', 'hierarchy'];

interface ExtractRequestBody {
  document_id: string;
  content: string;
  collection_id?: string;
  options?: {
    extract_tables?: boolean;
    extract_lists?: boolean;
    extract_key_value?: boolean;
    extract_hierarchy?: boolean;
    infer_schema?: boolean;
    min_table_rows?: number;
    min_table_cols?: number;
    generate_embeddings?: boolean;
    generate_cell_embeddings?: boolean;
    model?: 'haiku' | 'sonnet';
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;
  let keyId: string | undefined;

  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    userId = authResult.userId;
    keyId = authResult.keyId;
    const { plan, rateLimitHeaders } = authResult;

    // Parse request body
    let body: ExtractRequestBody;
    try {
      body = await request.json();
    } catch {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidBody('Invalid JSON in request body');
    }

    // Validate required fields
    if (!body.document_id || typeof body.document_id !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('document_id');
    }

    if (!body.content || typeof body.content !== 'string') {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.missingField('content');
    }

    // Validate UUID format for document_id
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(body.document_id)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidFormat('document_id', 'UUID');
    }

    // Validate collection_id if provided
    if (body.collection_id && !uuidRegex.test(body.collection_id)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidFormat('collection_id', 'UUID');
    }

    // Validate content length
    const maxContentLength = 500000; // 500KB
    if (body.content.length > maxContentLength) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField(
        'content',
        `Content exceeds maximum length of ${maxContentLength} characters`
      );
    }

    // Build extraction options
    const options: ExtractionOptions = {
      extractTables: body.options?.extract_tables ?? true,
      extractLists: body.options?.extract_lists ?? true,
      extractKeyValue: body.options?.extract_key_value ?? true,
      extractHierarchy: body.options?.extract_hierarchy ?? false,
      inferSchema: body.options?.infer_schema ?? true,
      minTableRows: body.options?.min_table_rows ?? 2,
      minTableCols: body.options?.min_table_cols ?? 2,
      generateEmbeddings: body.options?.generate_embeddings ?? true,
      generateCellEmbeddings: body.options?.generate_cell_embeddings ?? false,
      model: body.options?.model ?? 'haiku',
      collectionId: body.collection_id,
    };

    // Validate model option
    if (options.model && !['haiku', 'sonnet'].includes(options.model)) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        400
      );
      return ValidationErrors.invalidField('options.model', 'must be "haiku" or "sonnet"');
    }

    // Extract structures
    const extractionResult = await extractStructures(
      body.content,
      body.document_id,
      userId,
      options
    );

    // Save to database
    const saveResult = await saveExtractedStructures(
      userId,
      body.document_id,
      extractionResult,
      options
    );

    // Build response
    const response: ExtractResponse = {
      success: saveResult.errors.length === 0,
      structures_created: saveResult.structuresInserted,
      cells_created: saveResult.cellsInserted,
      duration_ms: extractionResult.metadata.processingTimeMs,
      structures: extractionResult.structures.map((s, _i) => ({
        id: '', // Would need to track IDs from save operation
        type: s.type,
        title: s.title,
        row_count: s.row_count,
        column_count: s.column_count,
      })),
    };

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
      200,
      {
        embedding: options.generateEmbeddings
          ? extractionResult.metadata.tablesFound +
            extractionResult.metadata.listsFound +
            extractionResult.metadata.keyValuePairsFound
          : 0,
      }
    );

    // Build NextResponse with headers
    const nextResponse = NextResponse.json({
      ...response,
      plan,
      metadata: {
        tables_found: extractionResult.metadata.tablesFound,
        lists_found: extractionResult.metadata.listsFound,
        key_value_pairs_found: extractionResult.metadata.keyValuePairsFound,
        hierarchies_found: extractionResult.metadata.hierarchiesFound,
        total_cells: extractionResult.metadata.totalCells,
        model_used: extractionResult.metadata.modelUsed,
      },
    });

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
        nextResponse.headers.set(key, value);
      });
    }

    return nextResponse;
  } catch (err) {
    console.error('Doc-to-DB extract error:', err);

    // Log error
    if (userId && keyId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/doc-to-db/extract', method: 'POST', startTime },
        500
      ).catch(console.error);
    }

    // Return appropriate error response
    if (err instanceof Error) {
      if (err.message.includes('ANTHROPIC_API_KEY')) {
        return ServerErrors.aiModel('claude');
      }
      if (err.message.includes('VOYAGE_API_KEY')) {
        return ServerErrors.embedding();
      }
    }

    return ServerErrors.internal('structure extraction');
  }
}
