import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api-auth';
import { AuthErrors, ServerErrors } from '@/lib/api-error';
import { RerankerService, getRerankerService } from '@/lib/reranker';

/**
 * POST /api/rerank - Domain-adaptive reranking
 *
 * Reranks documents based on query relevance with domain optimization
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const body = await request.json();
    const { query, documents, config } = body;

    if (!query || !documents || !Array.isArray(documents)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'query and documents array are required',
          },
        },
        { status: 400 }
      );
    }

    if (documents.length === 0) {
      return NextResponse.json({
        success: true,
        documents: [],
        model: config?.model || 'cohere-rerank-v3',
        domain: config?.domain || 'general',
        latency_ms: 0,
      });
    }

    const reranker = getRerankerService();

    const result = await reranker.rerank({
      query,
      documents: documents.map((doc: { id?: string; content: string; metadata?: unknown; score?: number }, idx: number) => ({
        id: doc.id || `doc-${idx}`,
        content: doc.content,
        metadata: doc.metadata || {},
        originalScore: doc.score,
      })),
      config,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Rerank error:', error);
    return ServerErrors.internal('rerank');
  }
}

/**
 * GET /api/rerank - Get available models and domains
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateApiKey(request);
    if (!authResult?.success) {
      return AuthErrors.invalidKey();
    }

    const { searchParams } = new URL(request.url);
    const info = searchParams.get('info');

    if (info === 'models') {
      return NextResponse.json({
        success: true,
        models: RerankerService.getAvailableModels(),
      });
    }

    if (info === 'domains') {
      return NextResponse.json({
        success: true,
        domains: RerankerService.getDomainConfigs(),
      });
    }

    // Return both by default
    return NextResponse.json({
      success: true,
      models: RerankerService.getAvailableModels(),
      domains: RerankerService.getDomainConfigs(),
    });
  } catch (error) {
    console.error('Rerank info error:', error);
    return ServerErrors.internal('rerank_info');
  }
}
