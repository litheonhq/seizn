import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse, logRequest } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import { parsePdf, storeBlocks } from '@/lib/multimodal';
import type { ParseOptions } from '@/lib/multimodal';

/**
 * POST /api/multimodal/parse
 *
 * Parse a PDF document and extract structured blocks with layout preservation.
 *
 * Request:
 * - Content-Type: multipart/form-data
 * - file: PDF file to parse
 * - collection_id: Collection to store blocks in
 * - options: JSON string with parse options
 *
 * Response:
 * {
 *   "success": true,
 *   "document": {
 *     "id": "uuid",
 *     "filename": "document.pdf",
 *     "pageCount": 10,
 *     "blockCount": 45
 *   },
 *   "blocks": [...],
 *   "latency_ms": 1234
 * }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Authenticate
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId, rateLimitHeaders } = authResult;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const collectionId = formData.get('collection_id') as string | null;
    const optionsJson = formData.get('options') as string | null;

    // Validate file
    if (!file) {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/parse', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('file');
    }

    // Validate collection_id
    if (!collectionId) {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/parse', method: 'POST', startTime }, 400);
      return ValidationErrors.missingField('collection_id');
    }

    // Validate file type
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      await logRequest({ userId, keyId, endpoint: '/api/multimodal/parse', method: 'POST', startTime }, 400);
      return ValidationErrors.invalidField('file', 'Only PDF files are supported');
    }

    // Parse options
    let parseOptions: ParseOptions = {};
    if (optionsJson) {
      try {
        parseOptions = JSON.parse(optionsJson);
      } catch {
        await logRequest({ userId, keyId, endpoint: '/api/multimodal/parse', method: 'POST', startTime }, 400);
        return ValidationErrors.invalidField('options', 'Invalid JSON');
      }
    }

    // Read file buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse PDF
    const parsedDocument = await parsePdf(buffer, parseOptions);

    // Update filename
    parsedDocument.filename = file.name;

    // Store blocks in database
    const storeResult = await storeBlocks(userId, collectionId, parsedDocument.blocks, {
      generateEmbeddings: true,
    });

    // Log request
    await logRequest(
      { userId, keyId, endpoint: '/api/multimodal/parse', method: 'POST', startTime },
      200,
      { embedding: parsedDocument.blocks.length * 100 } // Rough estimate
    );

    const response = NextResponse.json(
      {
        success: true,
        document: {
          id: parsedDocument.id,
          filename: parsedDocument.filename,
          mimeType: parsedDocument.mimeType,
          pageCount: parsedDocument.pageCount,
          blockCount: parsedDocument.blocks.length,
          parsedAt: parsedDocument.parsedAt,
        },
        store: {
          storedCount: storeResult.storedCount,
          blockIds: storeResult.blockIds,
        },
        blocks: parsedDocument.blocks.map((block) => ({
          id: block.id,
          blockType: block.blockType,
          pageNumber: block.pageNumber,
          contentPreview: block.content.substring(0, 200) + (block.content.length > 200 ? '...' : ''),
          bbox: block.bbox,
        })),
        latency_ms: Date.now() - startTime,
      },
      { status: 200 }
    );

    // Add rate limit headers
    if (rateLimitHeaders) {
      Object.entries(rateLimitHeaders).forEach(([k, v]) => response.headers.set(k, v));
    }

    return response;
  } catch (err) {
    console.error('Multimodal parse error:', err);

    return ServerErrors.internal('parse');
  }
}

/**
 * GET /api/multimodal/parse
 *
 * Returns API documentation for the parse endpoint
 */
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/multimodal/parse',
    method: 'POST',
    description: 'Parse PDF documents with layout preservation',
    authentication: 'Authorization: Bearer <api-key> header required',
    content_type: 'multipart/form-data',
    request_fields: {
      file: {
        type: 'File',
        required: true,
        description: 'PDF file to parse',
      },
      collection_id: {
        type: 'string (UUID)',
        required: true,
        description: 'Collection ID to store parsed blocks',
      },
      options: {
        type: 'JSON string',
        required: false,
        description: 'Parse options',
        schema: {
          extractTables: {
            type: 'boolean',
            default: true,
            description: 'Extract table structures',
          },
          extractFigures: {
            type: 'boolean',
            default: true,
            description: 'Extract figures/images',
          },
          detectCode: {
            type: 'boolean',
            default: true,
            description: 'Detect code blocks',
          },
          maxPages: {
            type: 'number',
            default: 500,
            description: 'Maximum pages to process',
          },
        },
      },
    },
    response: {
      success: 'boolean',
      document: {
        id: 'Document UUID',
        filename: 'Original filename',
        pageCount: 'Total pages',
        blockCount: 'Number of blocks extracted',
      },
      store: {
        storedCount: 'Blocks stored in database',
        blockIds: 'Array of block UUIDs',
      },
      blocks: 'Array of block summaries',
      latency_ms: 'Processing time',
    },
    block_types: ['text', 'heading', 'table', 'code', 'list', 'caption', 'figure'],
  });
}
