/**
 * Contract Validator
 *
 * Validates AI responses against defined contracts.
 */

import type {
  Contract,
  Assertion,
  AssertionInput,
  ContractInput,
  ValidationResult,
  AssertionResult,
  ValidationStatus,
} from './types';
import { executeAssertion } from './assertions';
import { randomUUID } from 'crypto';

// ============================================
// Contract Creation
// ============================================

/**
 * Create a new contract from input
 */
export function createContract(
  userId: string,
  input: ContractInput
): Omit<Contract, 'created_at' | 'updated_at'> {
  const now = new Date().toISOString();
  const contractId = randomUUID();

  const assertions: Assertion[] = input.assertions.map((a, index) => ({
    id: `${contractId}-assertion-${index}`,
    type: a.type,
    field: a.field,
    params: a.params,
    message: a.message,
    severity: a.severity || 'error',
  }));

  return {
    id: contractId,
    user_id: userId,
    name: input.name,
    description: input.description,
    version: input.version || '1.0.0',
    assertions,
    metadata: input.metadata,
  };
}

/**
 * Add assertion to contract
 */
export function addAssertion(
  contract: Contract,
  input: AssertionInput
): Contract {
  const assertion: Assertion = {
    id: `${contract.id}-assertion-${contract.assertions.length}`,
    type: input.type,
    field: input.field,
    params: input.params,
    message: input.message,
    severity: input.severity || 'error',
  };

  return {
    ...contract,
    assertions: [...contract.assertions, assertion],
    updated_at: new Date().toISOString(),
  };
}

/**
 * Remove assertion from contract
 */
export function removeAssertion(
  contract: Contract,
  assertionId: string
): Contract {
  return {
    ...contract,
    assertions: contract.assertions.filter(a => a.id !== assertionId),
    updated_at: new Date().toISOString(),
  };
}

// ============================================
// Contract Validation
// ============================================

/**
 * Validate data against a contract
 */
export function validateContract(
  contract: Contract,
  data: unknown
): ValidationResult {
  const startTime = Date.now();
  const results: AssertionResult[] = [];

  for (const assertion of contract.assertions) {
    const result = executeAssertion(data, assertion);
    results.push(result);
  }

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;

  // Overall status: fail if any assertion failed, warning if only warnings, pass otherwise
  let status: ValidationStatus = 'pass';
  if (failed > 0) {
    status = 'fail';
  } else if (warnings > 0) {
    status = 'warning';
  }

  return {
    contractId: contract.id,
    contractName: contract.name,
    contractVersion: contract.version,
    status,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    totalAssertions: results.length,
    passed,
    failed,
    warnings,
    results,
    metadata: contract.metadata,
  };
}

/**
 * Validate data against multiple contracts
 */
export function validateContracts(
  contracts: Contract[],
  data: unknown
): ValidationResult[] {
  return contracts.map(contract => validateContract(contract, data));
}

// ============================================
// Quick Validation Helpers
// ============================================

export interface QuickValidationOptions {
  hasFields?: string[];
  matchesSchemas?: Array<{ field: string; schema: Record<string, unknown> }>;
  inRanges?: Array<{ field: string; min?: number; max?: number }>;
  regexPatterns?: Array<{ field: string; pattern: string; flags?: string }>;
  nonEmptyFields?: string[];
}

/**
 * Create a temporary contract for quick validation
 */
export function quickValidate(
  data: unknown,
  options: QuickValidationOptions
): ValidationResult {
  const assertions: Assertion[] = [];
  let idx = 0;

  // Has fields
  if (options.hasFields) {
    for (const field of options.hasFields) {
      assertions.push({
        id: `quick-${idx++}`,
        type: 'hasField',
        field,
        severity: 'error',
      });
    }
  }

  // Matches schemas
  if (options.matchesSchemas) {
    for (const { field, schema } of options.matchesSchemas) {
      assertions.push({
        id: `quick-${idx++}`,
        type: 'matchesSchema',
        field,
        params: { schema },
        severity: 'error',
      });
    }
  }

  // In ranges
  if (options.inRanges) {
    for (const { field, min, max } of options.inRanges) {
      assertions.push({
        id: `quick-${idx++}`,
        type: 'inRange',
        field,
        params: { min, max },
        severity: 'error',
      });
    }
  }

  // Regex patterns
  if (options.regexPatterns) {
    for (const { field, pattern, flags } of options.regexPatterns) {
      assertions.push({
        id: `quick-${idx++}`,
        type: 'matchesRegex',
        field,
        params: { pattern, flags },
        severity: 'error',
      });
    }
  }

  // Non-empty fields
  if (options.nonEmptyFields) {
    for (const field of options.nonEmptyFields) {
      assertions.push({
        id: `quick-${idx++}`,
        type: 'isNonEmpty',
        field,
        severity: 'error',
      });
    }
  }

  const tempContract: Contract = {
    id: 'quick-validation',
    user_id: 'system',
    name: 'Quick Validation',
    version: '1.0.0',
    assertions,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return validateContract(tempContract, data);
}

// ============================================
// Validation Summary
// ============================================

export interface ValidationSummary {
  totalContracts: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  warningAssertions: number;
  overallStatus: ValidationStatus;
  contractResults: Array<{
    contractId: string;
    contractName: string;
    status: ValidationStatus;
  }>;
}

/**
 * Generate a summary from multiple validation results
 */
export function summarizeValidations(results: ValidationResult[]): ValidationSummary {
  let totalAssertions = 0;
  let passedAssertions = 0;
  let failedAssertions = 0;
  let warningAssertions = 0;

  const contractResults = results.map(r => {
    totalAssertions += r.totalAssertions;
    passedAssertions += r.passed;
    failedAssertions += r.failed;
    warningAssertions += r.warnings;

    return {
      contractId: r.contractId,
      contractName: r.contractName,
      status: r.status,
    };
  });

  let overallStatus: ValidationStatus = 'pass';
  if (failedAssertions > 0) {
    overallStatus = 'fail';
  } else if (warningAssertions > 0) {
    overallStatus = 'warning';
  }

  return {
    totalContracts: results.length,
    totalAssertions,
    passedAssertions,
    failedAssertions,
    warningAssertions,
    overallStatus,
    contractResults,
  };
}
