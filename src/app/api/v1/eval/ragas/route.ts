/**
 * POST /api/v1/eval/ragas - Run Ragas-style RAG evaluation
 *
 * Evaluates RAG pipeline output using Ragas-compatible metrics:
 * - answer_relevancy: How relevant is the answer to the question
 * - answer_correctness: How correct is the answer vs ground truth
 * - answer_similarity: Semantic similarity to ground truth
 * - faithfulness: Is the answer grounded in context
 * - context_precision: How much context is relevant
 * - context_recall: How much ground truth is covered by context
 * - context_relevancy: How relevant are context chunks
 *
 * @security Requires eval:run or admin scope
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/auth/api-key';
import {
  evaluateRagas,
  evaluateRagasBatch,
  type RagasEvalInput,
  type RagasEvalOptions,
} from '@/lib/eval/ragas-metrics';

interface SingleEvalRequest {
  mode: 'single';
  input: RagasEvalInput;
  options?: RagasEvalOptions;
}

interface BatchEvalRequest {
  mode: 'batch';
  inputs: RagasEvalInput[];
  options?: RagasEvalOptions;
}

type EvalRequest = SingleEvalRequest | BatchEvalRequest;

export async function POST(request: NextRequest) {
  try {
    // Authenticate
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    // Check permissions
    const hasPermission =
      auth.scopes?.includes('admin') ||
      auth.scopes?.includes('eval:run') ||
      auth.scopes?.includes('*');

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Requires admin or eval:run scope' },
        { status: 403 }
      );
    }

    const body = (await request.json()) as EvalRequest;

    // Validate request
    if (body.mode === 'single') {
      if (!body.input?.question || !body.input?.answer) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: 'input.question and input.answer are required',
          },
          { status: 400 }
        );
      }

      const result = await evaluateRagas(body.input, body.options);

      return NextResponse.json({
        mode: 'single',
        result,
      });
    } else if (body.mode === 'batch') {
      if (!Array.isArray(body.inputs) || body.inputs.length === 0) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'inputs array is required' },
          { status: 400 }
        );
      }

      // Validate all inputs
      for (let i = 0; i < body.inputs.length; i++) {
        if (!body.inputs[i]?.question || !body.inputs[i]?.answer) {
          return NextResponse.json(
            {
              error: 'Bad Request',
              message: `inputs[${i}].question and inputs[${i}].answer are required`,
            },
            { status: 400 }
          );
        }
      }

      // Limit batch size
      if (body.inputs.length > 100) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'Maximum batch size is 100' },
          { status: 400 }
        );
      }

      const result = await evaluateRagasBatch(body.inputs, body.options);

      return NextResponse.json({
        mode: 'batch',
        count: body.inputs.length,
        aggregated_metrics: result.aggregated,
        total_tokens: result.total_tokens,
        total_model_calls: result.total_model_calls,
        results: result.results,
      });
    } else {
      return NextResponse.json(
        { error: 'Bad Request', message: 'mode must be "single" or "batch"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('[RagasEval] Error:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/eval/ragas - Get available metrics info
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateApiKey(request);
    if (!auth.valid) {
      return NextResponse.json(
        { error: 'Unauthorized', message: auth.error },
        { status: 401 }
      );
    }

    return NextResponse.json({
      name: 'Ragas-Compatible RAG Evaluation',
      version: '1.0.0',
      metrics: {
        answer_relevancy: {
          description: 'How relevant is the answer to the question',
          requires: ['question', 'answer'],
          uses_llm: true,
          uses_embeddings: true,
        },
        answer_correctness: {
          description: 'How correct is the answer compared to ground truth',
          requires: ['question', 'answer', 'groundTruth'],
          uses_llm: true,
          uses_embeddings: true,
        },
        answer_similarity: {
          description: 'Semantic similarity between answer and ground truth',
          requires: ['answer', 'groundTruth'],
          uses_llm: false,
          uses_embeddings: true,
        },
        faithfulness: {
          description: 'Is the answer faithful to (grounded in) the context',
          requires: ['answer', 'contexts'],
          uses_llm: true,
          uses_embeddings: false,
        },
        context_precision: {
          description: 'How much of the retrieved context is relevant',
          requires: ['question', 'contexts'],
          uses_llm: true,
          uses_embeddings: false,
        },
        context_recall: {
          description: 'How much of the ground truth is covered by context',
          requires: ['groundTruth', 'contexts'],
          uses_llm: true,
          uses_embeddings: false,
        },
        context_relevancy: {
          description: 'How relevant each context chunk is to the question',
          requires: ['question', 'contexts'],
          uses_llm: false,
          uses_embeddings: true,
        },
      },
      default_options: {
        answerRelevancy: false,
        answerCorrectness: true,
        answerSimilarity: true,
        faithfulness: true,
        contextPrecision: false,
        contextRecall: true,
        contextRelevancy: true,
      },
      example_request: {
        mode: 'single',
        input: {
          question: 'What is the capital of France?',
          answer: 'Paris is the capital of France.',
          contexts: [
            'France is a country in Western Europe. Its capital is Paris.',
            'Paris is known for the Eiffel Tower and the Louvre Museum.',
          ],
          groundTruth: 'The capital of France is Paris.',
        },
        options: {
          faithfulness: true,
          answerCorrectness: true,
          contextRelevancy: true,
        },
      },
      required_scopes: ['admin', 'eval:run'],
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
