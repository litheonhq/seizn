/**
 * Doc-to-DB: Schema Inference
 *
 * Utilities for inferring data types and schemas from cell values.
 */

import type { CellDataType, SchemaFieldDefinition } from './types';

// ============================================================
// Regular Expressions for Type Detection
// ============================================================

const PATTERNS = {
  // Email: standard email format
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,

  // URL: http(s) or www
  url: /^(https?:\/\/|www\.)[^\s]+$/i,

  // Phone: various formats including international
  phone: /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}$/,

  // Date: various date formats
  date: {
    iso: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/,
    us: /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
    eu: /^\d{1,2}[.\-]\d{1,2}[.\-]\d{2,4}$/,
    written: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+\d{1,2},?\s+\d{4}$/i,
    monthYear: /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$/i,
  },

  // Currency: with or without symbol
  currency: /^[\$\€\£\¥\₩\₹]?\s*-?[\d,]+\.?\d*\s*(USD|EUR|GBP|JPY|KRW|INR)?$/i,

  // Percentage: with or without symbol
  percentage: /^-?\d+\.?\d*\s*%$/,

  // Boolean: various representations
  boolean: /^(true|false|yes|no|y|n|1|0)$/i,

  // Number: integers, floats, negative, with thousand separators
  integer: /^-?\d+$/,
  float: /^-?\d+\.\d+$/,
  numberWithCommas: /^-?[\d,]+\.?\d*$/,
  scientific: /^-?\d+\.?\d*[eE][+-]?\d+$/,
};

// ============================================================
// Individual Type Detectors
// ============================================================

/**
 * Check if value is a valid email
 */
export function isEmail(value: string): boolean {
  return PATTERNS.email.test(value.trim());
}

/**
 * Check if value is a URL
 */
export function isUrl(value: string): boolean {
  return PATTERNS.url.test(value.trim());
}

/**
 * Check if value is a phone number
 */
export function isPhone(value: string): boolean {
  const cleaned = value.replace(/[\s\-\(\)\.]/g, '');
  return PATTERNS.phone.test(value.trim()) && cleaned.length >= 7 && cleaned.length <= 15;
}

/**
 * Check if value is a date
 */
export function isDate(value: string): boolean {
  const trimmed = value.trim();
  return (
    PATTERNS.date.iso.test(trimmed) ||
    PATTERNS.date.us.test(trimmed) ||
    PATTERNS.date.eu.test(trimmed) ||
    PATTERNS.date.written.test(trimmed) ||
    PATTERNS.date.monthYear.test(trimmed)
  );
}

/**
 * Check if value is a currency amount
 */
export function isCurrency(value: string): boolean {
  const trimmed = value.trim();
  // Must have currency symbol or suffix
  if (!trimmed.match(/[\$\€\£\¥\₩\₹]|USD|EUR|GBP|JPY|KRW|INR/i)) {
    return false;
  }
  return PATTERNS.currency.test(trimmed);
}

/**
 * Check if value is a percentage
 */
export function isPercentage(value: string): boolean {
  return PATTERNS.percentage.test(value.trim());
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: string): boolean {
  return PATTERNS.boolean.test(value.trim());
}

/**
 * Check if value is a number
 */
export function isNumber(value: string): boolean {
  const trimmed = value.trim().replace(/,/g, '');

  if (trimmed === '' || trimmed === '-' || trimmed === '.') {
    return false;
  }

  return (
    PATTERNS.integer.test(trimmed) ||
    PATTERNS.float.test(trimmed) ||
    PATTERNS.scientific.test(trimmed)
  );
}

// ============================================================
// Main Type Inference
// ============================================================

/**
 * Infer the data type of a single cell value
 *
 * @param value - Cell value to analyze
 * @returns Inferred data type
 */
export function inferCellType(value: string): CellDataType {
  if (!value || value.trim() === '') {
    return 'unknown';
  }

  const trimmed = value.trim();

  // Check specific types first (more specific -> more general)

  // Email has a very specific pattern
  if (isEmail(trimmed)) {
    return 'email';
  }

  // URL check
  if (isUrl(trimmed)) {
    return 'url';
  }

  // Phone check
  if (isPhone(trimmed)) {
    return 'phone';
  }

  // Boolean check (before number, since 1/0 could be both)
  if (isBoolean(trimmed)) {
    return 'boolean';
  }

  // Percentage (before number, since it contains digits)
  if (isPercentage(trimmed)) {
    return 'percentage';
  }

  // Currency (before number, since it contains digits)
  if (isCurrency(trimmed)) {
    return 'currency';
  }

  // Date check (before number, since dates contain digits)
  if (isDate(trimmed)) {
    return 'date';
  }

  // Number check
  if (isNumber(trimmed)) {
    return 'number';
  }

  // Default to text
  return 'text';
}

// ============================================================
// Column Type Inference
// ============================================================

/**
 * Infer the data type for a column based on multiple values
 *
 * @param values - Array of values from the column
 * @returns Most likely data type
 */
export function inferColumnType(values: string[]): CellDataType {
  // Filter out empty values
  const nonEmpty = values.filter((v) => v && v.trim() !== '');

  if (nonEmpty.length === 0) {
    return 'unknown';
  }

  // Count occurrences of each type
  const typeCounts: Record<CellDataType, number> = {
    text: 0,
    number: 0,
    date: 0,
    currency: 0,
    percentage: 0,
    boolean: 0,
    email: 0,
    url: 0,
    phone: 0,
    unknown: 0,
  };

  for (const value of nonEmpty) {
    const type = inferCellType(value);
    typeCounts[type]++;
  }

  // Find the dominant type
  let maxType: CellDataType = 'text';
  let maxCount = 0;

  for (const [type, count] of Object.entries(typeCounts)) {
    // Require at least 50% match for non-text types
    const threshold = type === 'text' ? 0 : nonEmpty.length * 0.5;

    if (count > maxCount && count >= threshold) {
      maxCount = count;
      maxType = type as CellDataType;
    }
  }

  // If text is dominant but other types have significant presence, stay with text
  if (maxType === 'text' && typeCounts.text < nonEmpty.length * 0.3) {
    // Find second most common type
    const sorted = Object.entries(typeCounts)
      .filter(([t]) => t !== 'text' && t !== 'unknown')
      .sort((a, b) => b[1] - a[1]);

    if (sorted.length > 0 && sorted[0][1] >= nonEmpty.length * 0.5) {
      return sorted[0][0] as CellDataType;
    }
  }

  return maxType;
}

// ============================================================
// Schema Generation
// ============================================================

/**
 * Generate schema definitions from table headers and data
 *
 * @param headers - Column headers
 * @param rows - Data rows
 * @returns Array of field definitions
 */
export function generateSchema(
  headers: string[],
  rows: (string | number | boolean | null)[][]
): SchemaFieldDefinition[] {
  const schema: SchemaFieldDefinition[] = [];

  for (let colIdx = 0; colIdx < headers.length; colIdx++) {
    const header = headers[colIdx];

    // Get all values for this column
    const values = rows
      .map((row) => row[colIdx])
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v));

    const fieldType = inferColumnType(values);

    // Check if field is required (all rows have a value)
    const nonEmptyCount = values.filter((v) => v.trim() !== '').length;
    const required = nonEmptyCount === rows.length;

    // Detect constraints
    const constraints: SchemaFieldDefinition['constraints'] = {};

    if (fieldType === 'number') {
      const numbers = values.map((v) => parseFloat(v.replace(/,/g, ''))).filter((n) => !isNaN(n));
      if (numbers.length > 0) {
        constraints.min = Math.min(...numbers);
        constraints.max = Math.max(...numbers);
      }
    }

    // Detect enum values (if limited distinct values)
    const uniqueValues = [...new Set(values.filter((v) => v.trim() !== ''))];
    if (uniqueValues.length > 0 && uniqueValues.length <= 10 && uniqueValues.length < rows.length) {
      constraints.enum = uniqueValues;
    }

    schema.push({
      name: header,
      type: fieldType,
      required,
      description: generateFieldDescription(header, fieldType, uniqueValues),
      constraints: Object.keys(constraints).length > 0 ? constraints : undefined,
    });
  }

  return schema;
}

/**
 * Generate a description for a field based on its name and type
 */
function generateFieldDescription(
  name: string,
  type: CellDataType,
  uniqueValues: string[]
): string {
  const normalizedName = name.toLowerCase().replace(/[_-]/g, ' ');

  // Type-specific descriptions
  const typeDescriptions: Record<CellDataType, string> = {
    text: 'Text value',
    number: 'Numeric value',
    date: 'Date value',
    currency: 'Currency amount',
    percentage: 'Percentage value',
    boolean: 'Boolean flag',
    email: 'Email address',
    url: 'Web URL',
    phone: 'Phone number',
    unknown: 'Value',
  };

  let description = typeDescriptions[type];

  // Add enum info if applicable
  if (uniqueValues.length > 0 && uniqueValues.length <= 5) {
    description += ` (${uniqueValues.join(', ')})`;
  } else if (uniqueValues.length <= 10) {
    description += ` with ${uniqueValues.length} distinct values`;
  }

  // Try to make it more descriptive based on common field names
  if (normalizedName.includes('name')) description = 'Name field';
  if (normalizedName.includes('id')) description = 'Identifier';
  if (normalizedName.includes('price') || normalizedName.includes('cost'))
    description = 'Price/cost amount';
  if (normalizedName.includes('date') || normalizedName.includes('time')) description = 'Timestamp';
  if (normalizedName.includes('email')) description = 'Email address';
  if (normalizedName.includes('phone') || normalizedName.includes('tel'))
    description = 'Phone number';
  if (normalizedName.includes('address')) description = 'Address information';
  if (normalizedName.includes('status')) description = 'Status indicator';
  if (normalizedName.includes('count') || normalizedName.includes('quantity'))
    description = 'Count/quantity';

  return description;
}

// ============================================================
// Value Normalization
// ============================================================

/**
 * Normalize a value based on its inferred type
 *
 * @param value - Raw value
 * @param type - Inferred data type
 * @returns Normalized value
 */
export function normalizeValue(
  value: string,
  type: CellDataType
): string | number | boolean | null {
  const trimmed = value.trim();

  if (trimmed === '') {
    return null;
  }

  switch (type) {
    case 'number':
      const num = parseFloat(trimmed.replace(/,/g, ''));
      return isNaN(num) ? trimmed : num;

    case 'boolean':
      const lower = trimmed.toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(lower)) return true;
      if (['false', 'no', 'n', '0'].includes(lower)) return false;
      return trimmed;

    case 'currency':
      // Keep as string to preserve currency symbol
      return trimmed;

    case 'percentage':
      // Keep as string to preserve % symbol
      return trimmed;

    default:
      return trimmed;
  }
}

/**
 * Parse a currency string to numeric value
 */
export function parseCurrency(value: string): number | null {
  const cleaned = value.replace(/[\$\€\£\¥\₩\₹,\s]|USD|EUR|GBP|JPY|KRW|INR/gi, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a percentage string to numeric value (as decimal)
 */
export function parsePercentage(value: string): number | null {
  const cleaned = value.replace(/%/, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num / 100;
}

// ============================================================
// Type Validation
// ============================================================

/**
 * Validate that a value matches the expected type
 */
export function validateType(value: string, expectedType: CellDataType): boolean {
  if (!value || value.trim() === '') {
    return true; // Empty values are valid for any type
  }

  const actualType = inferCellType(value);

  // Direct match
  if (actualType === expectedType) {
    return true;
  }

  // Number can be currency/percentage
  if (expectedType === 'number' && ['currency', 'percentage'].includes(actualType)) {
    return true;
  }

  // Text accepts everything
  if (expectedType === 'text') {
    return true;
  }

  return false;
}
