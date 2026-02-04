/**
 * Seizn Policy Test API
 *
 * POST /api/v1/policy/test
 * Run policy test suites
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PolicySimulator, BUILTIN_TEST_CASES, runBuiltinTests } from '@/lib/opa/simulator';
import { getApiKeyFromRequest, validateApiKey } from '@/lib/api-auth';
import { createApiResponse, createApiError } from '@/lib/api-response';
import type { PolicyTestSuite, PolicyTestSuiteResult } from '@/lib/opa/types';

// ============================================
// Request Validation Schema
// ============================================

const TestCaseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  input: z.object({
    action: z.string(),
    user: z.object({
      id: z.string(),
      role: z.string(),
      plan: z.string(),
    }).passthrough(),
    context: z.object({
      timestamp: z.string(),
    }).passthrough(),
  }).passthrough(),
  expected: z.record(z.unknown()),
});

const TestSuiteRequestSchema = z.object({
  suite: z.string().optional().default('custom'),
  tests: z.array(TestCaseSchema).optional(),
  include_builtin: z.boolean().optional().default(false),
});

// ============================================
// POST Handler - Run test suite
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const apiKey = getApiKeyFromRequest(request);
    if (!apiKey) {
      return createApiError(401, 'UNAUTHORIZED', 'Missing API key');
    }

    const authResult = await validateApiKey(apiKey);
    if (!authResult.valid) {
      return createApiError(401, 'UNAUTHORIZED', authResult.error || 'Invalid API key');
    }

    // Check permission for policy testing
    if (!['owner', 'admin'].includes(authResult.user?.role || '')) {
      return createApiError(
        403,
        'FORBIDDEN',
        'Policy testing requires admin or owner role'
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = TestSuiteRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return createApiError(
        400,
        'VALIDATION_ERROR',
        'Invalid request body',
        parseResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }))
      );
    }

    const { suite: suiteName, tests: customTests, include_builtin } = parseResult.data;

    // Collect tests to run
    const allTests = [];

    // Add custom tests
    if (customTests && customTests.length > 0) {
      allTests.push(...customTests);
    }

    // Add built-in tests if requested
    if (include_builtin) {
      allTests.push(...BUILTIN_TEST_CASES);
    }

    // If no tests specified, run built-in tests
    if (allTests.length === 0) {
      const result = await runBuiltinTests();
      return createApiResponse<PolicyTestSuiteResult>(result);
    }

    // Create test suite
    const testSuite: PolicyTestSuite = {
      name: suiteName,
      tests: allTests as PolicyTestSuite['tests'],
    };

    // Run tests
    const simulator = new PolicySimulator();
    const result = await simulator.runTestSuite(testSuite);

    return createApiResponse<PolicyTestSuiteResult>(result);
  } catch (error) {
    console.error('[Policy Test API] Error:', error);
    return createApiError(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// ============================================
// GET Handler - Get test cases
// ============================================

export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const apiKey = getApiKeyFromRequest(request);
    if (!apiKey) {
      return createApiError(401, 'UNAUTHORIZED', 'Missing API key');
    }

    const authResult = await validateApiKey(apiKey);
    if (!authResult.valid) {
      return createApiError(401, 'UNAUTHORIZED', authResult.error || 'Invalid API key');
    }

    // Return available test cases
    return createApiResponse({
      builtin_tests: BUILTIN_TEST_CASES.map((test) => ({
        name: test.name,
        description: test.description,
        action: test.input.action,
        expected_keys: Object.keys(test.expected),
      })),
      total_builtin: BUILTIN_TEST_CASES.length,
      categories: {
        memory: BUILTIN_TEST_CASES.filter((t) => t.input.action.startsWith('memory.')).length,
        k12: BUILTIN_TEST_CASES.filter((t) => t.input.action.startsWith('k12.')).length,
        pii: BUILTIN_TEST_CASES.filter(
          (t) => t.input.data?.pii_detected && t.input.data.pii_detected.length > 0
        ).length,
        rate_limit: BUILTIN_TEST_CASES.filter(
          (t) => t.input.context?.request_count_minute !== undefined
        ).length,
      },
    });
  } catch (error) {
    console.error('[Policy Test Info API] Error:', error);
    return createApiError(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
