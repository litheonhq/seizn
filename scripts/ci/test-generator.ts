#!/usr/bin/env npx ts-node
/**
 * Seizn CI - Test Generator
 *
 * Generates test cases from collected Flight Recorder traces.
 * Usage: npx ts-node scripts/ci/test-generator.ts --input=.seizn-traces --output=.seizn-generated-tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type {
  CITrace,
  CITraceCollection,
  GeneratedTest,
  TestAssertion,
  TestGenerationResult,
  TestGenerationSummary,
  TestGeneratorOptions,
} from './types';

// ============================================
// CLI Argument Parser
// ============================================

function parseArgs(): TestGeneratorOptions {
  const args = process.argv.slice(2);
  const options: TestGeneratorOptions = {
    input: '.seizn-traces',
    output: '.seizn-generated-tests',
  };

  for (const arg of args) {
    const [key, value] = arg.replace(/^--/, '').split('=');

    switch (key) {
      case 'input':
        options.input = value;
        break;
      case 'output':
        options.output = value;
        break;
      case 'trace-id':
        options.traceId = value;
        break;
      case 'types':
        options.types = value.split(',') as GeneratedTest['type'][];
        break;
      case 'min-confidence':
        options.minConfidence = parseFloat(value);
        break;
      case 'max-tests':
        options.maxTests = parseInt(value, 10);
        break;
    }
  }

  return options;
}

// ============================================
// Test Generator
// ============================================

class TestGenerator {
  private options: TestGeneratorOptions;
  private collection: CITraceCollection | null = null;
  private generatedTests: GeneratedTest[] = [];

  constructor(options: TestGeneratorOptions) {
    this.options = options;
  }

  /**
   * Generate tests from collected traces
   */
  async generate(): Promise<TestGenerationResult> {
    console.log('[Seizn CI] Starting test generation...');

    // Load traces
    await this.loadTraces();

    if (!this.collection) {
      throw new Error('No trace collection found');
    }

    console.log(`[Seizn CI] Loaded ${this.collection.traces.length} traces`);

    // Generate tests for each relevant trace
    for (const trace of this.collection.traces) {
      const tests = this.generateTestsForTrace(trace);
      this.generatedTests.push(...tests);
    }

    // Apply filters
    this.applyFilters();

    // Build result
    const result = this.buildResult();

    // Save output
    await this.saveResult(result);

    return result;
  }

  /**
   * Load traces from input directory
   */
  private async loadTraces(): Promise<void> {
    const inputDir = this.options.input;

    // Try JSON format first
    const jsonPath = path.join(inputDir, 'traces.json');
    if (fs.existsSync(jsonPath)) {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      this.collection = JSON.parse(content);
      return;
    }

    // Try JSONL format
    const jsonlPath = path.join(inputDir, 'traces.jsonl');
    if (fs.existsSync(jsonlPath)) {
      const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n').filter(Boolean);

      let metadata: CITraceCollection['metadata'] | null = null;
      let summary: CITraceCollection['summary'] | null = null;
      const traces: CITrace[] = [];

      for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.type === 'metadata') metadata = entry.data;
        else if (entry.type === 'summary') summary = entry.data;
        else if (entry.type === 'trace') traces.push(entry.data);
      }

      if (metadata && summary) {
        this.collection = { metadata, summary, traces };
      }
      return;
    }

    throw new Error(`No trace files found in ${inputDir}`);
  }

  /**
   * Generate tests for a single trace
   */
  private generateTestsForTrace(trace: CITrace): GeneratedTest[] {
    const tests: GeneratedTest[] = [];

    // Skip traces without useful IO data or that are too simple
    if (!this.isTestWorthy(trace)) {
      return tests;
    }

    // Generate based on trace type
    switch (trace.service) {
      case 'api':
        tests.push(...this.generateApiTests(trace));
        break;
      case 'summer':
      case 'spring':
      case 'fall':
      case 'winter':
        tests.push(...this.generateSeasonTests(trace));
        break;
      case 'test':
        tests.push(...this.generateRegressionTests(trace));
        break;
      default:
        tests.push(...this.generateGenericTests(trace));
    }

    return tests;
  }

  /**
   * Check if a trace is worth generating tests for
   */
  private isTestWorthy(trace: CITrace): boolean {
    // Always generate tests for errors
    if (trace.status === 'error') return true;

    // Skip very fast operations (likely trivial)
    if (trace.durationMs !== undefined && trace.durationMs < 5) return false;

    // Skip internal/logging operations
    const skipOperations = ['log', 'trace', 'metric', 'health_check'];
    if (skipOperations.some((op) => trace.operationName.includes(op))) return false;

    // Must have either IO data or meaningful tags
    if (trace.io?.input !== undefined || trace.io?.output !== undefined) return true;
    if (Object.keys(trace.tags).length > 2) return true;

    return false;
  }

  /**
   * Generate tests for API traces
   */
  private generateApiTests(trace: CITrace): GeneratedTest[] {
    const tests: GeneratedTest[] = [];
    const endpoint = trace.tags['http.url'] as string | undefined;
    const method = trace.tags['http.method'] as string | undefined;
    const statusCode = trace.tags['http.status_code'] as number | undefined;

    if (!endpoint) return tests;

    // Happy path test
    if (trace.status === 'ok') {
      tests.push({
        id: randomUUID(),
        sourceTraceId: trace.id,
        name: `${method} ${endpoint} - Success`,
        description: `Test successful ${method} request to ${endpoint}`,
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
          assertions: this.generateApiAssertions(trace),
        },
        code: this.generateApiTestCode(trace, endpoint, method ?? 'GET'),
        priority: this.calculatePriority(trace),
        confidence: this.calculateConfidence(trace),
        generatedAt: new Date().toISOString(),
      });
    }

    // Error case test
    if (trace.status === 'error') {
      tests.push({
        id: randomUUID(),
        sourceTraceId: trace.id,
        name: `${method} ${endpoint} - Error Handling`,
        description: `Test error handling for ${method} request to ${endpoint}`,
        type: 'integration',
        category: 'api',
        target: {
          service: trace.service,
          operation: trace.operationName,
          endpoint,
        },
        testCase: {
          input: trace.io?.input ?? { method, url: endpoint },
          expectedOutput: { error: trace.error },
          assertions: [
            { type: 'truthy', path: 'error', message: 'Should return error' },
          ],
        },
        code: this.generateErrorTestCode(trace, endpoint, method ?? 'GET'),
        priority: 'high',
        confidence: 0.8,
        generatedAt: new Date().toISOString(),
      });
    }

    return tests;
  }

  /**
   * Generate tests for Season-specific traces
   */
  private generateSeasonTests(trace: CITrace): GeneratedTest[] {
    const tests: (GeneratedTest | null)[] = [];

    // Memory operations (Spring)
    if (trace.service === 'spring' && trace.operationName.includes('memory')) {
      tests.push(this.generateMemoryTest(trace));
    }

    // Search operations (Summer)
    if (trace.service === 'summer' && trace.operationName.includes('search')) {
      tests.push(this.generateSearchTest(trace));
    }

    // Eval operations (Fall)
    if (trace.service === 'fall' && trace.operationName.includes('eval')) {
      tests.push(this.generateEvalTest(trace));
    }

    // Policy operations (Winter)
    if (trace.service === 'winter') {
      tests.push(this.generatePolicyTest(trace));
    }

    return tests.filter((test): test is GeneratedTest => test !== null);
  }

  /**
   * Generate regression tests from existing test traces
   */
  private generateRegressionTests(trace: CITrace): GeneratedTest[] {
    if (trace.status !== 'error') return [];

    const testName = trace.tags['test.name'] as string | undefined;
    if (!testName) return [];

    return [
      {
        id: randomUUID(),
        sourceTraceId: trace.id,
        name: `Regression: ${testName}`,
        description: `Regression test for previously failing test: ${testName}`,
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
        code: this.generateRegressionTestCode(trace, testName),
        priority: 'critical',
        confidence: 0.95,
        generatedAt: new Date().toISOString(),
      },
    ];
  }

  /**
   * Generate generic tests for other traces
   */
  private generateGenericTests(trace: CITrace): GeneratedTest[] {
    if (!trace.io?.input || !trace.io?.output) return [];

    return [
      {
        id: randomUUID(),
        sourceTraceId: trace.id,
        name: `${trace.operationName} - ${trace.status === 'ok' ? 'Success' : 'Error'}`,
        description: `Auto-generated test for ${trace.operationName}`,
        type: 'unit',
        category: 'function',
        target: {
          service: trace.service,
          operation: trace.operationName,
        },
        testCase: {
          input: trace.io.input,
          expectedOutput: trace.io.output,
          assertions: [
            { type: 'equals', message: 'Should return expected output' },
          ],
        },
        code: this.generateGenericTestCode(trace),
        priority: this.calculatePriority(trace),
        confidence: this.calculateConfidence(trace),
        generatedAt: new Date().toISOString(),
      },
    ];
  }

  // ============================================
  // Helper Methods
  // ============================================

  private generateMemoryTest(trace: CITrace): GeneratedTest | null {
    return {
      id: randomUUID(),
      sourceTraceId: trace.id,
      name: `Memory ${trace.operationName}`,
      description: `Test memory operation: ${trace.operationName}`,
      type: 'unit',
      category: 'function',
      target: {
        service: 'spring',
        operation: trace.operationName,
      },
      testCase: {
        input: trace.io?.input,
        expectedOutput: trace.io?.output,
        assertions: [
          { type: 'truthy', path: 'success', message: 'Operation should succeed' },
        ],
      },
      code: `
describe('Spring Memory', () => {
  it('${trace.operationName}', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await memoryOperation('${trace.operationName}', input);
    expect(result.success).toBe(true);
  });
});`.trim(),
      priority: this.calculatePriority(trace),
      confidence: this.calculateConfidence(trace),
      generatedAt: new Date().toISOString(),
    };
  }

  private generateSearchTest(trace: CITrace): GeneratedTest | null {
    return {
      id: randomUUID(),
      sourceTraceId: trace.id,
      name: `Search ${trace.operationName}`,
      description: `Test search operation: ${trace.operationName}`,
      type: 'integration',
      category: 'api',
      target: {
        service: 'summer',
        operation: trace.operationName,
      },
      testCase: {
        input: trace.io?.input,
        expectedOutput: trace.io?.output,
        assertions: [
          { type: 'truthy', path: 'results', message: 'Should return results' },
        ],
      },
      code: `
describe('Summer Search', () => {
  it('${trace.operationName}', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await search(input);
    expect(result.results).toBeDefined();
    expect(result.results.length).toBeGreaterThan(0);
  });
});`.trim(),
      priority: this.calculatePriority(trace),
      confidence: this.calculateConfidence(trace),
      generatedAt: new Date().toISOString(),
    };
  }

  private generateEvalTest(trace: CITrace): GeneratedTest | null {
    return {
      id: randomUUID(),
      sourceTraceId: trace.id,
      name: `Eval ${trace.operationName}`,
      description: `Test evaluation: ${trace.operationName}`,
      type: 'integration',
      category: 'workflow',
      target: {
        service: 'fall',
        operation: trace.operationName,
      },
      testCase: {
        input: trace.io?.input,
        expectedOutput: trace.io?.output,
        assertions: [
          { type: 'truthy', path: 'score', message: 'Should return score' },
        ],
      },
      code: `
describe('Fall Eval', () => {
  it('${trace.operationName}', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await runEval(input);
    expect(result.score).toBeDefined();
  });
});`.trim(),
      priority: this.calculatePriority(trace),
      confidence: this.calculateConfidence(trace),
      generatedAt: new Date().toISOString(),
    };
  }

  private generatePolicyTest(trace: CITrace): GeneratedTest | null {
    return {
      id: randomUUID(),
      sourceTraceId: trace.id,
      name: `Policy ${trace.operationName}`,
      description: `Test policy: ${trace.operationName}`,
      type: 'unit',
      category: 'function',
      target: {
        service: 'winter',
        operation: trace.operationName,
      },
      testCase: {
        input: trace.io?.input,
        expectedOutput: trace.io?.output,
        assertions: [
          { type: 'truthy', path: 'compliant', message: 'Should check compliance' },
        ],
      },
      code: `
describe('Winter Policy', () => {
  it('${trace.operationName}', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const result = await checkPolicy('${trace.operationName}', input);
    expect(result.compliant).toBeDefined();
  });
});`.trim(),
      priority: this.calculatePriority(trace),
      confidence: this.calculateConfidence(trace),
      generatedAt: new Date().toISOString(),
    };
  }

  private generateApiAssertions(trace: CITrace): TestAssertion[] {
    const assertions: TestAssertion[] = [];

    const statusCode = trace.tags['http.status_code'];
    if (statusCode) {
      assertions.push({
        type: 'equals',
        path: 'statusCode',
        expected: statusCode,
        message: `Status code should be ${statusCode}`,
      });
    }

    if (trace.io?.output) {
      assertions.push({
        type: 'truthy',
        path: 'body',
        message: 'Should return response body',
      });
    }

    return assertions;
  }

  private generateApiTestCode(trace: CITrace, endpoint: string, method: string): string {
    return `
describe('API: ${endpoint}', () => {
  it('should handle ${method} request successfully', async () => {
    const response = await fetch('${endpoint}', {
      method: '${method}',
      headers: { 'x-api-key': process.env.SEIZN_API_KEY },
      ${trace.io?.input ? `body: JSON.stringify(${JSON.stringify(trace.io.input)}),` : ''}
    });

    expect(response.ok).toBe(true);
    ${trace.tags['http.status_code'] ? `expect(response.status).toBe(${trace.tags['http.status_code']});` : ''}

    const data = await response.json();
    expect(data).toBeDefined();
  });
});`.trim();
  }

  private generateErrorTestCode(trace: CITrace, endpoint: string, method: string): string {
    return `
describe('API Error: ${endpoint}', () => {
  it('should handle error gracefully', async () => {
    const response = await fetch('${endpoint}', {
      method: '${method}',
      headers: { 'x-api-key': process.env.SEIZN_API_KEY },
      ${trace.io?.input ? `body: JSON.stringify(${JSON.stringify(trace.io.input)}),` : ''}
    });

    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.error.error_code).toBeDefined();
  });
});`.trim();
  }

  private generateRegressionTestCode(trace: CITrace, testName: string): string {
    return `
describe('Regression: ${testName}', () => {
  it('should not fail like before', async () => {
    // Original failure: ${trace.error ?? 'Unknown error'}
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const expected = ${JSON.stringify(trace.io?.expectedOutput ?? trace.io?.output, null, 2)};

    const result = await runOriginalTest(input);
    expect(result).toEqual(expected);
  });
});`.trim();
  }

  private generateGenericTestCode(trace: CITrace): string {
    return `
describe('${trace.operationName}', () => {
  it('should execute correctly', async () => {
    const input = ${JSON.stringify(trace.io?.input, null, 2)};
    const expected = ${JSON.stringify(trace.io?.output, null, 2)};

    const result = await execute('${trace.operationName}', input);
    expect(result).toEqual(expected);
  });
});`.trim();
  }

  private calculatePriority(trace: CITrace): GeneratedTest['priority'] {
    if (trace.status === 'error') return 'critical';
    if (trace.status === 'timeout') return 'high';
    if (trace.durationMs && trace.durationMs > 1000) return 'high';
    if (trace.service === 'api') return 'medium';
    return 'low';
  }

  private calculateConfidence(trace: CITrace): number {
    let confidence = 0.5;

    // Higher confidence with IO data
    if (trace.io?.input) confidence += 0.2;
    if (trace.io?.output) confidence += 0.2;

    // Higher confidence for errors (clear expected behavior)
    if (trace.status === 'error') confidence += 0.1;

    // Lower confidence for generic operations
    if (trace.operationName === 'unknown') confidence -= 0.2;

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Apply filters to generated tests
   */
  private applyFilters(): void {
    // Filter by types
    if (this.options.types) {
      this.generatedTests = this.generatedTests.filter((t) =>
        this.options.types!.includes(t.type)
      );
    }

    // Filter by confidence
    if (this.options.minConfidence !== undefined) {
      this.generatedTests = this.generatedTests.filter(
        (t) => t.confidence >= this.options.minConfidence!
      );
    }

    // Limit count
    if (this.options.maxTests) {
      // Sort by priority and confidence
      this.generatedTests.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return b.confidence - a.confidence;
      });
      this.generatedTests = this.generatedTests.slice(0, this.options.maxTests);
    }
  }

  /**
   * Build the final result
   */
  private buildResult(): TestGenerationResult {
    const summary = this.calculateSummary();

    return {
      metadata: this.collection!.metadata,
      tests: this.generatedTests,
      summary,
    };
  }

  /**
   * Calculate test generation summary
   */
  private calculateSummary(): TestGenerationSummary {
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

    for (const test of this.generatedTests) {
      byType[test.type]++;
      byCategory[test.category]++;
      byPriority[test.priority]++;
      totalConfidence += test.confidence;
    }

    return {
      totalTests: this.generatedTests.length,
      byType,
      byCategory,
      byPriority,
      avgConfidence:
        this.generatedTests.length > 0
          ? totalConfidence / this.generatedTests.length
          : 0,
      coverageEstimate: Math.min(
        1,
        this.generatedTests.length / Math.max(1, this.collection!.traces.length)
      ),
    };
  }

  /**
   * Save result to output directory
   */
  private async saveResult(result: TestGenerationResult): Promise<void> {
    const outputDir = this.options.output;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save tests JSON
    const testsPath = path.join(outputDir, 'tests.json');
    fs.writeFileSync(testsPath, JSON.stringify(result, null, 2));

    // Save individual test files
    const testsDir = path.join(outputDir, 'generated');
    if (!fs.existsSync(testsDir)) {
      fs.mkdirSync(testsDir, { recursive: true });
    }

    for (const test of result.tests) {
      const testPath = path.join(testsDir, `${test.id}.test.ts`);
      fs.writeFileSync(testPath, test.code);
    }

    // Save summary
    const summaryPath = path.join(outputDir, 'summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(result.summary, null, 2));

    console.log(`[Seizn CI] Generated ${result.tests.length} tests`);
    console.log(`[Seizn CI] Saved to ${outputDir}`);
  }
}

// ============================================
// Main Entry Point
// ============================================

async function main(): Promise<void> {
  try {
    const options = parseArgs();
    const generator = new TestGenerator(options);
    const result = await generator.generate();

    console.log('\n[Seizn CI] Test generation complete');
    console.log(`[Seizn CI] Total tests: ${result.summary.totalTests}`);
    console.log(`[Seizn CI] By type:`, result.summary.byType);
    console.log(`[Seizn CI] Avg confidence: ${(result.summary.avgConfidence * 100).toFixed(1)}%`);

    process.exit(0);
  } catch (error) {
    console.error('[Seizn CI] Test generation failed:', error);
    process.exit(1);
  }
}

main();
