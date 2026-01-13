/**
 * Seizn CI API - Tests by Trace ID Endpoint
 *
 * GET /api/ci/tests/:traceId - Get generated tests for a trace
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { NotFoundErrors, ServerErrors, ValidationErrors } from '@/lib/api-error';
import type {
  CITrace,
  CITraceRecord,
  GeneratedTest,
  TestAssertion,
  TestGenerationSummary,
  GetTestsResponse,
} from '../../types';

// ============================================
// Test Generation Logic
// ============================================

function generateTestsFromTraces(traces: CITrace[], options?: {
  types?: GeneratedTest['type'][];
  minConfidence?: number;
}): GeneratedTest[] {
  const generatedTests: GeneratedTest[] = [];

  for (const trace of traces) {
    // Skip traces that aren't test-worthy
    if (!isTestWorthy(trace)) continue;

    const tests = generateTestsForTrace(trace);
    generatedTests.push(...tests);
  }

  // Apply filters
  let filtered = generatedTests;

  if (options?.types && options.types.length > 0) {
    filtered = filtered.filter((t) => options.types!.includes(t.type));
  }

  if (options?.minConfidence !== undefined) {
    filtered = filtered.filter((t) => t.confidence >= options.minConfidence!);
  }

  return filtered;
}

function isTestWorthy(trace: CITrace): boolean {
  // Always generate tests for errors
  if (trace.status === 'error') return true;

  // Skip very fast operations
  if (trace.durationMs !== undefined && trace.durationMs < 5) return false;

  // Skip internal operations
  const skipOperations = ['log', 'trace', 'metric', 'health_check'];
  if (skipOperations.some((op) => trace.operationName.includes(op))) return false;

  // Must have IO data or meaningful tags
  if (trace.io?.input !== undefined || trace.io?.output !== undefined) return true;
  if (Object.keys(trace.tags).length > 2) return true;

  return false;
}

function generateTestsForTrace(trace: CITrace): GeneratedTest[] {
  const tests: GeneratedTest[] = [];

  // API tests
  if (trace.tags['http.url'] || trace.service === 'api') {
    tests.push(...generateApiTests(trace));
  }

  // Season-specific tests
  if (['spring', 'summer', 'fall', 'winter'].includes(trace.service)) {
    tests.push(...generateSeasonTests(trace));
  }

  // Regression tests from errors
  if (trace.status === 'error') {
    tests.push(...generateRegressionTests(trace));
  }

  // Generic tests
  if (tests.length === 0 && trace.io?.input && trace.io?.output) {
    tests.push(generateGenericTest(trace));
  }

  return tests;
}

function generateApiTests(trace: CITrace): GeneratedTest[] {
  const tests: GeneratedTest[] = [];
  const endpoint = trace.tags['http.url'] as string | undefined;
  const method = (trace.tags['http.method'] as string) ?? 'GET';
  const statusCode = trace.tags['http.status_code'] as number | undefined;

  if (!endpoint) return tests;

  const assertions: TestAssertion[] = [];
  if (statusCode) {
    assertions.push({
      type: 'equals',
      path: 'statusCode',
      expected: statusCode,
      message: `Status code should be ${statusCode}`,
    });
  }

  tests.push({
    id: randomUUID(),
    sourceTraceId: trace.id,
    name: `${method} ${endpoint} - ${trace.status === 'ok' ? 'Success' : 'Error'}`,
    description: `Test ${method} request to ${endpoint}`,
    type: 'integration',
    category: 'api',
    target: {
      service: trace.service,
      operation: trace.operationName,
      endpoint,
    },
    testCase: {
      input: trace.io?.input ?? { method, url: endpoint },
      expectedOutput: trace.io?.output ?? { statusCode: statusCode ?? 200 },
      assertions,
    },
    code: generateApiTestCode(trace, endpoint, method),
    priority: trace.status === 'error' ? 'critical' : 'medium',
    confidence: calculateConfidence(trace),
    generatedAt: new Date().toISOString(),
  });

  return tests;
}

function generateSeasonTests(trace: CITrace): GeneratedTest[] {
  const tests: GeneratedTest[] = [];

  const test: GeneratedTest = {
    id: randomUUID(),
    sourceTraceId: trace.id,
    name: `${trace.service} - ${trace.operationName}`,
    description: `Test ${trace.service} operation: ${trace.operationName}`,
    type: 'unit',
    category: 'function',
    target: {
      service: trace.service,
      operation: trace.operationName,
    },
    testCase: {
      input: trace.io?.input,
      expectedOutput: trace.io?.output,
      assertions: [
        { type: 'truthy', path: 'success', message: 'Operation should succeed' },
      ],
    },
    code: generateSeasonTestCode(trace),
    priority: trace.status === 'error' ? 'high' : 'medium',
    confidence: calculateConfidence(trace),
    generatedAt: new Date().toISOString(),
  };

  tests.push(test);
  return tests;
}

function generateRegressionTests(trace: CITrace): GeneratedTest[] {
  return [
    {
      id: randomUUID(),
      sourceTraceId: trace.id,
      name: `Regression: ${trace.operationName}`,
      description: `Regression test for failed operation: ${trace.operationName}`,
      type: 'regression',
      category: 'function',
      target: {
        service: trace.service,
        operation: trace.operationName,
      },
      testCase: {
        input: trace.io?.input,
        expectedOutput: trace.io?.expectedOutput ?? trace.io?.output,
        assertions: [
          { type: 'equals', message: 'Should match expected output' },
        ],
      },
      code: generateRegressionTestCode(trace),
      priority: 'critical',
      confidence: 0.9,
      generatedAt: new Date().toISOString(),
    },
  ];
}

function generateGenericTest(trace: CITrace): GeneratedTest {
  return {
    id: randomUUID(),
    sourceTraceId: trace.id,
    name: `${trace.operationName} - Generic Test`,
    description: `Auto-generated test for ${trace.operationName}`,
    type: 'unit',
    category: 'function',
    target: {
      service: trace.service,
      operation: trace.operationName,
    },
    testCase: {
      input: trace.io?.input,
      expectedOutput: trace.io?.output,
      assertions: [
        { type: 'equals', message: 'Should return expected output' },
      ],
    },
    code: generateGenericTestCode(trace),
    priority: 'low',
    confidence: calculateConfidence(trace),
    generatedAt: new Date().toISOString(),
  };
}

function calculateConfidence(trace: CITrace): number {
  let confidence = 0.5;
  if (trace.io?.input) confidence += 0.2;
  if (trace.io?.output) confidence += 0.2;
  if (trace.status === 'error') confidence += 0.1;
  if (trace.operationName === 'unknown') confidence -= 0.2;
  return Math.min(1, Math.max(0, confidence));
}

function generateApiTestCode(trace: CITrace, endpoint: string, method: string): string {
  return `
describe('API: ${endpoint}', () => {
  it('should handle ${method} request', async () => {
    const response = await fetch('${endpoint}', {
      method: '${method}',
      headers: { 'x-api-key': process.env.SEIZN_API_KEY },
      ${trace.io?.input ? `body: JSON.stringify(${JSON.stringify(trace.io.input)}),` : ''}
    });

    expect(response.ok).toBe(${trace.status === 'ok'});
    const data = await response.json();
    expect(data).toBeDefined();
  });
});`.trim();
}

function generateSeasonTestCode(trace: CITrace): string {
  return `
describe('${trace.service}', () => {
  it('${trace.operationName}', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await ${trace.service}Service.${trace.operationName}(input);
    expect(result).toBeDefined();
  });
});`.trim();
}

function generateRegressionTestCode(trace: CITrace): string {
  return `
describe('Regression: ${trace.operationName}', () => {
  it('should not fail', async () => {
    // Original error: ${trace.error ?? 'Unknown'}
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await execute('${trace.operationName}', input);
    expect(result).toBeDefined();
  });
});`.trim();
}

function generateGenericTestCode(trace: CITrace): string {
  return `
describe('${trace.operationName}', () => {
  it('should execute correctly', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await execute('${trace.operationName}', input);
    expect(result).toEqual(${JSON.stringify(trace.io?.output, null, 2)});
  });
});`.trim();
}

function calculateSummary(tests: GeneratedTest[]): TestGenerationSummary {
  const byType: Record<GeneratedTest['type'], number> = {
    unit: 0,
    integration: 0,
    e2e: 0,
    regression: 0,
  };

  const byCategory: Record<GeneratedTest['category'], number> = {
    api: 0,
    function: 0,
    component: 0,
    workflow: 0,
  };

  const byPriority: Record<GeneratedTest['priority'], number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  let totalConfidence = 0;

  for (const test of tests) {
    byType[test.type]++;
    byCategory[test.category]++;
    byPriority[test.priority]++;
    totalConfidence += test.confidence;
  }

  return {
    totalTests: tests.length,
    byType,
    byCategory,
    byPriority,
    avgConfidence: tests.length > 0 ? totalConfidence / tests.length : 0,
    coverageEstimate: Math.min(1, tests.length / 10), // Rough estimate
  };
}

// ============================================
// GET /api/ci/tests/:traceId
// ============================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ traceId: string }> }
): Promise<NextResponse> {
  try {
    // Authenticate request
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;
    const { traceId } = await params;

    // Validate traceId
    if (!traceId) {
      return ValidationErrors.missingField('traceId');
    }

    // Parse query parameters
    const url = new URL(request.url);
    const typesParam = url.searchParams.get('types');
    const minConfidence = url.searchParams.get('min_confidence');

    const options: {
      types?: GeneratedTest['type'][];
      minConfidence?: number;
    } = {};

    if (typesParam) {
      options.types = typesParam.split(',') as GeneratedTest['type'][];
    }
    if (minConfidence) {
      options.minConfidence = parseFloat(minConfidence);
    }

    // Fetch trace record
    const supabase = createServerClient();
    const { data: record, error } = await supabase
      .from('ci_traces')
      .select('*')
      .eq('user_id', userId)
      .eq('trace_id', traceId)
      .single();

    if (error || !record) {
      return NotFoundErrors.resource('CI Trace', traceId);
    }

    const traceRecord = record as CITraceRecord;

    // Generate tests from traces
    const tests = generateTestsFromTraces(traceRecord.traces_data, options);
    const summary = calculateSummary(tests);

    const response: GetTestsResponse = {
      success: true,
      tests,
      summary,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (err) {
    console.error('CI tests fetch error:', err);
    return ServerErrors.internal('ci_tests_fetch');
  }
}
