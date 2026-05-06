import { AuthorLlmError, type AuthorJsonSchema } from './types';

/**
 * Shared helpers used by both anthropic-client.ts and openai-client.ts.
 *
 * Audit cleanup 2026-05-07: before this module the two clients duplicated
 * ~95-100 lines of JSON parsing / schema validation / type-matching / sleep
 * helpers. The two `matchesSchemaType` implementations had also drifted —
 * the OpenAI client correctly rejected non-finite numbers, the Anthropic one
 * accepted any `typeof === 'number'`. This module is the single source of
 * truth so future fixes land in one place.
 */

export function buildSystemPrompt(
  system: string | undefined,
  responseFormat: string | undefined,
): string | undefined {
  if (responseFormat !== 'json') {
    return system;
  }
  const jsonInstruction = 'Return valid JSON only. Do not wrap the JSON in Markdown.';
  return system ? `${system}\n\n${jsonInstruction}` : jsonInstruction;
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  // ```json ... ``` or ``` ... ```
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  // Best-effort: take the first JSON-looking object/array if surrounded by prose
  const firstBrace = trimmed.search(/[\[{]/);
  const lastBrace = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (firstBrace > 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

export function parseAndValidateJson<TJson>(
  text: string,
  schema: AuthorJsonSchema | undefined,
  providerLabel: string,
): TJson {
  let parsed: unknown;
  const candidate = stripJsonFence(text);
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
    throw new AuthorLlmError(
      'INVALID_JSON_RESPONSE',
      `${providerLabel} response was not valid JSON: ${preview}`,
    );
  }

  if (schema) {
    const errors = validateJsonSchema(parsed, schema);
    if (errors.length > 0) {
      throw new AuthorLlmError(
        'JSON_SCHEMA_VALIDATION_FAILED',
        `${providerLabel} JSON response failed schema validation: ${errors[0]}`,
      );
    }
  }

  return parsed as TJson;
}

export function validateJsonSchema(value: unknown, schema: AuthorJsonSchema, path = '$'): string[] {
  const errors: string[] = [];
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push(`${path} must be one of schema enum values`);
  }

  if (schema.type && !matchesSchemaType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}`);
    return errors;
  }

  if (schema.type === 'object' && schema.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const required of schema.required ?? []) {
      if (!(required in record)) {
        errors.push(`${path}.${required} is required`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in record) {
        errors.push(...validateJsonSchema(record[key], childSchema, `${path}.${key}`));
      }
    }
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...validateJsonSchema(item, schema.items as AuthorJsonSchema, `${path}[${index}]`));
    });
  }

  return errors;
}

export function matchesSchemaType(value: unknown, type: NonNullable<AuthorJsonSchema['type']>): boolean {
  switch (type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      // Strict: reject NaN / Infinity so a hallucinated `Infinity` from the
      // model doesn't sneak past the validator and break downstream callers.
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return false;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strip provider-specific identifiers from SDK error messages before they reach
 * the response body. Today neither Anthropic nor OpenAI SDK error strings leak
 * keys, but they can include request URLs, organization IDs, and partial body
 * content — defense-in-depth: redact patterns that look risky.
 */
export function redactProviderError(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_\-]{20,}/g, '<redacted-api-key>')
    .replace(/sk-ant-[A-Za-z0-9_\-]{20,}/g, '<redacted-api-key>')
    .replace(/sk-svcacct-[A-Za-z0-9_\-]{20,}/g, '<redacted-api-key>')
    .replace(/Bearer\s+[A-Za-z0-9_\-.]{20,}/gi, 'Bearer <redacted>')
    .replace(/org-[A-Za-z0-9]{20,}/g, '<redacted-org-id>');
}
