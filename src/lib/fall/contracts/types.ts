/**
 * Answer Contract Types
 *
 * Defines the structure for response contracts that specify
 * what a valid AI response should look like.
 */

// ============================================
// Core Contract Types
// ============================================

export type AssertionType =
  | 'hasField'
  | 'matchesSchema'
  | 'matchesRegex'
  | 'inRange'
  | 'oneOf'
  | 'minLength'
  | 'maxLength'
  | 'isType'
  | 'isNonEmpty'
  | 'isArray'
  | 'arrayLength'
  | 'custom';

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null';

export interface Assertion {
  id: string;
  type: AssertionType;
  field?: string; // JSON path (e.g., 'response.data.items')
  params?: Record<string, unknown>;
  message?: string; // Custom error message
  severity: 'error' | 'warning';
}

export interface Contract {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  version: string;
  assertions: Assertion[];
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================
// Validation Result Types
// ============================================

export type ValidationStatus = 'pass' | 'fail' | 'warning';

export interface AssertionResult {
  assertionId: string;
  assertionType: AssertionType;
  field?: string;
  status: ValidationStatus;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ValidationResult {
  contractId: string;
  contractName: string;
  contractVersion: string;
  status: ValidationStatus;
  timestamp: string;
  durationMs: number;
  totalAssertions: number;
  passed: number;
  failed: number;
  warnings: number;
  results: AssertionResult[];
  metadata?: Record<string, unknown>;
}

// ============================================
// Contract Definition Input Types
// ============================================

export interface AssertionInput {
  type: AssertionType;
  field?: string;
  params?: Record<string, unknown>;
  message?: string;
  severity?: 'error' | 'warning';
}

export interface ContractInput {
  name: string;
  description?: string;
  version?: string;
  assertions: AssertionInput[];
  metadata?: Record<string, unknown>;
}

// ============================================
// Schema Types for matchesSchema assertion
// ============================================

export interface SchemaProperty {
  type: FieldType | FieldType[];
  required?: boolean;
  properties?: Record<string, SchemaProperty>;
  items?: SchemaProperty;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface Schema {
  type: FieldType;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

// ============================================
// Database Types
// ============================================

export interface ContractRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  version: string;
  assertions: Assertion[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ValidationLogRow {
  id: string;
  contract_id: string;
  user_id: string;
  status: ValidationStatus;
  duration_ms: number;
  total_assertions: number;
  passed: number;
  failed: number;
  warnings: number;
  results: AssertionResult[];
  input_snapshot?: Record<string, unknown>;
  created_at: string;
}
