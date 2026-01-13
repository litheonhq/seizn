/**
 * Test Generation API
 *
 * POST /api/testing/suites/[id]/generate - Generate tests for a suite
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, NotFoundErrors, ServerErrors } from '@/lib/api-error';
import {
  generateTestsFromDocs,
  generateTestsFromTemplate,
  saveGeneratedTests,
  fetchDocumentsForGeneration,
  validateGeneratedTests,
  deduplicateTests,
} from '@/lib/testing';
import type { GenerateTestsRequest, TestType } from '@/lib/testing/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/testing/suites/[id]/generate
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  const { id: suiteId } = await params;

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: GenerateTestsRequest = await request.json();
    const supabase = createServerClient();

    // Verify suite exists and belongs to user
    const { data: suite, error: suiteError } = await supabase
      .from('retrieval_test_suites')
      .select('*')
      .eq('id', suiteId)
      .eq('user_id', userId)
      .single();

    if (suiteError || !suite) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/generate`, method: 'POST', startTime },
        404
      );
      return NotFoundErrors.resource('Test suite');
    }

    // Get documents to generate from
    let docIds = body.doc_ids || [];

    // If no doc_ids provided, try to get from suite's collection
    if (docIds.length === 0 && suite.collection_id) {
      const { data: collectionDocs } = await supabase
        .from('summer_documents')
        .select('id')
        .eq('collection_id', suite.collection_id)
        .eq('user_id', userId)
        .limit(10);

      if (collectionDocs) {
        docIds = collectionDocs.map((d) => d.id);
      }
    }

    // If still no docs, try from suite's source_doc_ids
    if (docIds.length === 0 && suite.source_doc_ids?.length > 0) {
      docIds = suite.source_doc_ids;
    }

    if (docIds.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/generate`, method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        {
          error: {
            error_code: 'VALIDATION_ERROR',
            message: 'No documents provided or found in collection. Provide doc_ids in request.',
          },
        },
        { status: 400 }
      );
    }

    // Fetch document content
    const docs = await fetchDocumentsForGeneration(docIds, userId);

    if (docs.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/generate`, method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        {
          error: {
            error_code: 'VALIDATION_ERROR',
            message: 'Could not fetch any documents with provided IDs',
          },
        },
        { status: 400 }
      );
    }

    // Generation options
    const count = Math.min(body.count || 10, 50); // Max 50 tests per request
    const types: TestType[] = body.types || ['positive', 'negative', 'edge_case'];
    const model = body.model || 'haiku';

    // Generate tests
    let generatedTests;
    if (body.template_id) {
      generatedTests = await generateTestsFromTemplate(body.template_id, docs, count, model);
    } else {
      generatedTests = await generateTestsFromDocs(docs, { count, types, model });
    }

    // Validate and deduplicate
    const { valid, invalid } = validateGeneratedTests(generatedTests);
    const deduped = deduplicateTests(valid);

    if (deduped.length === 0) {
      await logRequest(
        { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/generate`, method: 'POST', startTime },
        200
      );
      return NextResponse.json({
        success: true,
        data: {
          generated: 0,
          saved: 0,
          invalid: invalid.length,
          message: 'No valid test cases could be generated',
        },
      });
    }

    // Save to database
    const savedTests = await saveGeneratedTests(suiteId, deduped, docIds);

    await logRequest(
      { userId, keyId, endpoint: `/api/testing/suites/${suiteId}/generate`, method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      data: {
        generated: generatedTests.length,
        valid: deduped.length,
        invalid: invalid.length,
        saved: savedTests.length,
        tests: savedTests,
        invalid_details: invalid.slice(0, 5), // Return first 5 invalid details
      },
    });
  } catch (error) {
    console.error('Generate tests error:', error);
    return ServerErrors.internal('generate_tests');
  }
}
