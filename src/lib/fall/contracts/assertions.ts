/**
 * Built-in Assertion Functions
 *
 * Collection of assertion functions for validating AI responses
 * against contract specifications.
 */

import type { Assertion, AssertionResult, FieldType, Schema, SchemaProperty } from './types';

// ============================================
// Utility Functions
// ============================================

/**
 * Get value from object using JSON path (e.g., 'response.data.items[0].name')
 */
export function getValueAtPath(obj: unknown, path: string): { found: boolean; value: unknown } {
  if (!path) {
    return { found: true, value: obj };
  }

  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return { found: false, value: undefined };
    }
    if (typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }

  return { found: true, value: current };
}

/**
 * Get the type of a value
 */
export function getType(value: unknown): FieldType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as FieldType;
}

// ============================================
// Assertion Functions
// ============================================

type AssertionFn = (
  data: unknown,
  assertion: Assertion
) => AssertionResult;

/**
 * Check if a field exists in the response
 */
export const hasField: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const { found, value } = getValueAtPath(data, path);

  return {
    assertionId: assertion.id,
    assertionType: 'hasField',
    field: path,
    status: found && value !== undefined ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: found && value !== undefined
      ? `Field "${path}" exists`
      : assertion.message || `Field "${path}" is missing`,
    expected: 'field to exist',
    actual: found ? value : 'undefined',
  };
};

/**
 * Check if value matches a JSON schema
 */
export const matchesSchema: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const schema = assertion.params?.schema as Schema | undefined;

  if (!schema) {
    return {
      assertionId: assertion.id,
      assertionType: 'matchesSchema',
      field: path,
      status: 'fail',
      message: 'Schema not provided in assertion params',
      expected: 'schema definition',
      actual: 'undefined',
    };
  }

  const { found, value } = getValueAtPath(data, path);
  if (!found) {
    return {
      assertionId: assertion.id,
      assertionType: 'matchesSchema',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" not found`,
      expected: 'field to exist',
      actual: 'undefined',
    };
  }

  const errors = validateSchema(value, schema, path);
  const status = errors.length === 0 ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail';

  return {
    assertionId: assertion.id,
    assertionType: 'matchesSchema',
    field: path,
    status,
    message: status === 'pass'
      ? `Field "${path}" matches schema`
      : assertion.message || `Schema validation failed: ${errors.join(', ')}`,
    expected: schema,
    actual: value,
  };
};

function validateSchema(value: unknown, schema: Schema | SchemaProperty, path: string): string[] {
  const errors: string[] = [];
  const actualType = getType(value);

  // Check type
  const expectedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!expectedTypes.includes(actualType)) {
    errors.push(`${path}: expected ${expectedTypes.join(' | ')}, got ${actualType}`);
    return errors;
  }

  // Check enum (only exists on SchemaProperty)
  if ('enum' in schema && schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value not in enum [${schema.enum.join(', ')}]`);
  }

  // Check string constraints (only exists on SchemaProperty)
  if (actualType === 'string' && typeof value === 'string') {
    if ('minLength' in schema && schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: length ${value.length} < minLength ${schema.minLength}`);
    }
    if ('maxLength' in schema && schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push(`${path}: length ${value.length} > maxLength ${schema.maxLength}`);
    }
    if ('pattern' in schema && schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push(`${path}: does not match pattern ${schema.pattern}`);
      }
    }
  }

  // Check number constraints (only exists on SchemaProperty)
  if (actualType === 'number' && typeof value === 'number') {
    if ('minimum' in schema && schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: value ${value} < minimum ${schema.minimum}`);
    }
    if ('maximum' in schema && schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: value ${value} > maximum ${schema.maximum}`);
    }
  }

  // Check object properties
  if (actualType === 'object' && schema.properties && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const fullSchema = schema as Schema;

    // Check required fields
    if (fullSchema.required) {
      for (const field of fullSchema.required) {
        if (!(field in obj)) {
          errors.push(`${path}.${field}: required field missing`);
        }
      }
    }

    // Validate each property
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (key in obj) {
        errors.push(...validateSchema(obj[key], propSchema, `${path}.${key}`));
      } else if (propSchema.required) {
        errors.push(`${path}.${key}: required field missing`);
      }
    }
  }

  // Check array items (only exists on SchemaProperty)
  if (actualType === 'array' && 'items' in schema && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateSchema(item, schema.items!, `${path}[${index}]`));
    });
  }

  return errors;
}

/**
 * Check if value matches a regex pattern
 */
export const matchesRegex: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const pattern = assertion.params?.pattern as string | undefined;

  if (!pattern) {
    return {
      assertionId: assertion.id,
      assertionType: 'matchesRegex',
      field: path,
      status: 'fail',
      message: 'Pattern not provided in assertion params',
      expected: 'regex pattern',
      actual: 'undefined',
    };
  }

  const { found, value } = getValueAtPath(data, path);
  if (!found || typeof value !== 'string') {
    return {
      assertionId: assertion.id,
      assertionType: 'matchesRegex',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" is not a string`,
      expected: 'string value',
      actual: found ? typeof value : 'undefined',
    };
  }

  const flags = assertion.params?.flags as string | undefined;
  const regex = new RegExp(pattern, flags);
  const matches = regex.test(value);

  return {
    assertionId: assertion.id,
    assertionType: 'matchesRegex',
    field: path,
    status: matches ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: matches
      ? `Field "${path}" matches pattern`
      : assertion.message || `Field "${path}" does not match pattern "${pattern}"`,
    expected: pattern,
    actual: value,
  };
};

/**
 * Check if numeric value is within range
 */
export const inRange: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const min = assertion.params?.min as number | undefined;
  const max = assertion.params?.max as number | undefined;

  const { found, value } = getValueAtPath(data, path);
  if (!found || typeof value !== 'number') {
    return {
      assertionId: assertion.id,
      assertionType: 'inRange',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" is not a number`,
      expected: 'numeric value',
      actual: found ? typeof value : 'undefined',
    };
  }

  const inMin = min === undefined || value >= min;
  const inMax = max === undefined || value <= max;
  const inBounds = inMin && inMax;

  return {
    assertionId: assertion.id,
    assertionType: 'inRange',
    field: path,
    status: inBounds ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: inBounds
      ? `Field "${path}" is within range`
      : assertion.message || `Field "${path}" value ${value} is out of range [${min ?? '-inf'}, ${max ?? 'inf'}]`,
    expected: { min, max },
    actual: value,
  };
};

/**
 * Check if value is one of allowed values
 */
export const oneOf: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const values = assertion.params?.values as unknown[] | undefined;

  if (!values || !Array.isArray(values)) {
    return {
      assertionId: assertion.id,
      assertionType: 'oneOf',
      field: path,
      status: 'fail',
      message: 'Values array not provided in assertion params',
      expected: 'values array',
      actual: 'undefined',
    };
  }

  const { found, value } = getValueAtPath(data, path);
  if (!found) {
    return {
      assertionId: assertion.id,
      assertionType: 'oneOf',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" not found`,
      expected: values,
      actual: 'undefined',
    };
  }

  const isOneOf = values.some(v => JSON.stringify(v) === JSON.stringify(value));

  return {
    assertionId: assertion.id,
    assertionType: 'oneOf',
    field: path,
    status: isOneOf ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: isOneOf
      ? `Field "${path}" is one of allowed values`
      : assertion.message || `Field "${path}" value is not one of: ${JSON.stringify(values)}`,
    expected: values,
    actual: value,
  };
};

/**
 * Check minimum length (string or array)
 */
export const minLength: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const min = assertion.params?.min as number | undefined;

  if (min === undefined) {
    return {
      assertionId: assertion.id,
      assertionType: 'minLength',
      field: path,
      status: 'fail',
      message: 'Minimum length not provided in assertion params',
      expected: 'min parameter',
      actual: 'undefined',
    };
  }

  const { found, value } = getValueAtPath(data, path);
  if (!found || (typeof value !== 'string' && !Array.isArray(value))) {
    return {
      assertionId: assertion.id,
      assertionType: 'minLength',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" is not a string or array`,
      expected: 'string or array',
      actual: found ? typeof value : 'undefined',
    };
  }

  const length = (value as string | unknown[]).length;
  const meets = length >= min;

  return {
    assertionId: assertion.id,
    assertionType: 'minLength',
    field: path,
    status: meets ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: meets
      ? `Field "${path}" meets minimum length`
      : assertion.message || `Field "${path}" length ${length} < minimum ${min}`,
    expected: { minLength: min },
    actual: length,
  };
};

/**
 * Check maximum length (string or array)
 */
export const maxLength: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const max = assertion.params?.max as number | undefined;

  if (max === undefined) {
    return {
      assertionId: assertion.id,
      assertionType: 'maxLength',
      field: path,
      status: 'fail',
      message: 'Maximum length not provided in assertion params',
      expected: 'max parameter',
      actual: 'undefined',
    };
  }

  const { found, value } = getValueAtPath(data, path);
  if (!found || (typeof value !== 'string' && !Array.isArray(value))) {
    return {
      assertionId: assertion.id,
      assertionType: 'maxLength',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" is not a string or array`,
      expected: 'string or array',
      actual: found ? typeof value : 'undefined',
    };
  }

  const length = (value as string | unknown[]).length;
  const meets = length <= max;

  return {
    assertionId: assertion.id,
    assertionType: 'maxLength',
    field: path,
    status: meets ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: meets
      ? `Field "${path}" meets maximum length`
      : assertion.message || `Field "${path}" length ${length} > maximum ${max}`,
    expected: { maxLength: max },
    actual: length,
  };
};

/**
 * Check if value is of specific type
 */
export const isType: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const expectedType = assertion.params?.type as FieldType | undefined;

  if (!expectedType) {
    return {
      assertionId: assertion.id,
      assertionType: 'isType',
      field: path,
      status: 'fail',
      message: 'Type not provided in assertion params',
      expected: 'type parameter',
      actual: 'undefined',
    };
  }

  const { found, value } = getValueAtPath(data, path);
  if (!found) {
    return {
      assertionId: assertion.id,
      assertionType: 'isType',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" not found`,
      expected: expectedType,
      actual: 'undefined',
    };
  }

  const actualType = getType(value);
  const matches = actualType === expectedType;

  return {
    assertionId: assertion.id,
    assertionType: 'isType',
    field: path,
    status: matches ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: matches
      ? `Field "${path}" is of type ${expectedType}`
      : assertion.message || `Field "${path}" expected type ${expectedType}, got ${actualType}`,
    expected: expectedType,
    actual: actualType,
  };
};

/**
 * Check if value is non-empty (string, array, or object)
 */
export const isNonEmpty: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const { found, value } = getValueAtPath(data, path);

  if (!found) {
    return {
      assertionId: assertion.id,
      assertionType: 'isNonEmpty',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" not found`,
      expected: 'non-empty value',
      actual: 'undefined',
    };
  }

  let isEmpty = false;
  if (typeof value === 'string') isEmpty = value.length === 0;
  else if (Array.isArray(value)) isEmpty = value.length === 0;
  else if (typeof value === 'object' && value !== null) isEmpty = Object.keys(value).length === 0;
  else isEmpty = value === null || value === undefined;

  return {
    assertionId: assertion.id,
    assertionType: 'isNonEmpty',
    field: path,
    status: !isEmpty ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: !isEmpty
      ? `Field "${path}" is non-empty`
      : assertion.message || `Field "${path}" is empty`,
    expected: 'non-empty value',
    actual: value,
  };
};

/**
 * Check if value is an array
 */
export const isArray: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const { found, value } = getValueAtPath(data, path);

  if (!found) {
    return {
      assertionId: assertion.id,
      assertionType: 'isArray',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" not found`,
      expected: 'array',
      actual: 'undefined',
    };
  }

  const isArr = Array.isArray(value);

  return {
    assertionId: assertion.id,
    assertionType: 'isArray',
    field: path,
    status: isArr ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: isArr
      ? `Field "${path}" is an array`
      : assertion.message || `Field "${path}" is not an array`,
    expected: 'array',
    actual: getType(value),
  };
};

/**
 * Check array length constraints
 */
export const arrayLength: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const min = assertion.params?.min as number | undefined;
  const max = assertion.params?.max as number | undefined;
  const exact = assertion.params?.exact as number | undefined;

  const { found, value } = getValueAtPath(data, path);
  if (!found || !Array.isArray(value)) {
    return {
      assertionId: assertion.id,
      assertionType: 'arrayLength',
      field: path,
      status: assertion.severity === 'warning' ? 'warning' : 'fail',
      message: assertion.message || `Field "${path}" is not an array`,
      expected: 'array',
      actual: found ? getType(value) : 'undefined',
    };
  }

  const length = value.length;
  let meets = true;
  let expectedStr = '';

  if (exact !== undefined) {
    meets = length === exact;
    expectedStr = `exactly ${exact}`;
  } else {
    if (min !== undefined && length < min) {
      meets = false;
      expectedStr = `>= ${min}`;
    }
    if (max !== undefined && length > max) {
      meets = false;
      expectedStr = expectedStr ? `${expectedStr} and <= ${max}` : `<= ${max}`;
    }
    if (!expectedStr) expectedStr = `[${min ?? 0}, ${max ?? 'inf'}]`;
  }

  return {
    assertionId: assertion.id,
    assertionType: 'arrayLength',
    field: path,
    status: meets ? 'pass' : assertion.severity === 'warning' ? 'warning' : 'fail',
    message: meets
      ? `Field "${path}" array length meets constraint`
      : assertion.message || `Field "${path}" array length ${length} does not meet constraint ${expectedStr}`,
    expected: { min, max, exact },
    actual: length,
  };
};

/**
 * Custom assertion with user-provided function (serialized as string)
 */
export const custom: AssertionFn = (data, assertion) => {
  const path = assertion.field || '';
  const { found, value } = getValueAtPath(data, path);

  return {
    assertionId: assertion.id,
    assertionType: 'custom',
    field: path,
    status: assertion.severity === 'warning' ? 'warning' : 'fail',
    message:
      assertion.message ||
      'Custom assertions are disabled for security. Use built-in assertion types.',
    expected: 'built-in assertion type',
    actual: found ? value : 'undefined',
  };
};

// ============================================
// Assertion Registry
// ============================================

export const assertionFunctions: Record<string, AssertionFn> = {
  hasField,
  matchesSchema,
  matchesRegex,
  inRange,
  oneOf,
  minLength,
  maxLength,
  isType,
  isNonEmpty,
  isArray,
  arrayLength,
  custom,
};

/**
 * Execute an assertion against data
 */
export function executeAssertion(data: unknown, assertion: Assertion): AssertionResult {
  const fn = assertionFunctions[assertion.type];
  if (!fn) {
    return {
      assertionId: assertion.id,
      assertionType: assertion.type,
      field: assertion.field,
      status: 'fail',
      message: `Unknown assertion type: ${assertion.type}`,
      expected: 'valid assertion type',
      actual: assertion.type,
    };
  }
  return fn(data, assertion);
}
