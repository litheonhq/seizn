import { AuthorReplayCacheMissError } from './replay';
import { logServerError } from '@/lib/server/logger';
import {
  AuthorMemoryV3ContractError,
  parseAuthorEvalJobPayload,
  runAuthorEvalJobPayload,
} from './contract';
import { InMemoryAuthorMemoryV3Store, type AuthorMemoryV3Store } from './store';
import type { AuthorEvalJobSummary, RunAuthorEvalJobOutput } from './job';
import type { AuthorEvalResult } from './types';
import type { AuthorEvalVerifier } from './verifier';

export interface AuthorEvalJobApiSuccess {
  success: true;
  run: AuthorEvalJobSummary;
  results: AuthorEvalResult[];
}

export interface AuthorEvalJobApiError {
  success: false;
  error: {
    code:
      | 'AUTHOR_MEMORY_V3_CONTRACT_ERROR'
      | 'AUTHOR_MEMORY_V3_REPLAY_MISS'
      | 'AUTHOR_MEMORY_V3_EXECUTION_ERROR';
    message: string;
    issues?: string[];
  };
}

export type AuthorEvalJobApiBody = AuthorEvalJobApiSuccess | AuthorEvalJobApiError;

export interface AuthorEvalJobApiResponse {
  status: number;
  body: AuthorEvalJobApiBody;
}

export async function handleAuthorEvalJobRequest(
  body: unknown,
  options: {
    store?: AuthorMemoryV3Store;
    verifier?: AuthorEvalVerifier;
  } = {}
): Promise<AuthorEvalJobApiResponse> {
  try {
    const payload = parseAuthorEvalJobPayload(body);
    const output = await runAuthorEvalJobPayload({
      payload,
      store: options.store ?? new InMemoryAuthorMemoryV3Store(),
      verifier: options.verifier,
    });

    return {
      status: 200,
      body: toSuccessBody(output),
    };
  } catch (error) {
    if (error instanceof AuthorMemoryV3ContractError) {
      return {
        status: 400,
        body: {
          success: false,
          error: {
            code: 'AUTHOR_MEMORY_V3_CONTRACT_ERROR',
            message: 'Invalid Author Memory v3 request payload',
            issues: error.issues,
          },
        },
      };
    }

    if (error instanceof AuthorReplayCacheMissError) {
      return {
        status: 409,
        body: {
          success: false,
          error: {
            code: 'AUTHOR_MEMORY_V3_REPLAY_MISS',
            message: error.message,
          },
        },
      };
    }

    return authorMemoryV3ExecutionErrorResponse(error);
  }
}

export function authorMemoryV3ExecutionErrorResponse(error: unknown): AuthorEvalJobApiResponse {
  logServerError('Author Memory v3 execution failed', error);

  return {
    status: 500,
    body: {
      success: false,
      error: {
        code: 'AUTHOR_MEMORY_V3_EXECUTION_ERROR',
        message: 'Author Memory v3 execution failed',
      },
    },
  };
}

function toSuccessBody(output: RunAuthorEvalJobOutput): AuthorEvalJobApiSuccess {
  return {
    success: true,
    run: output.summary,
    results: output.cases.map((item) => item.result),
  };
}
