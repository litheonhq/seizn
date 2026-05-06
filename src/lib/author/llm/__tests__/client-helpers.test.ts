import { describe, expect, it } from 'vitest';

import {
  buildSystemPrompt,
  matchesSchemaType,
  parseAndValidateJson,
  redactProviderError,
  stripJsonFence,
} from '../client-helpers';

describe('buildSystemPrompt', () => {
  it('returns system unchanged when responseFormat is not json', () => {
    expect(buildSystemPrompt('You are a novelist.', 'text')).toBe('You are a novelist.');
    expect(buildSystemPrompt(undefined, 'text')).toBeUndefined();
  });

  it('appends JSON instruction when responseFormat is json', () => {
    expect(buildSystemPrompt('You are a novelist.', 'json')).toMatch(/Return valid JSON only/);
    expect(buildSystemPrompt(undefined, 'json')).toBe('Return valid JSON only. Do not wrap the JSON in Markdown.');
  });
});

describe('stripJsonFence', () => {
  it('strips ```json ... ``` fence', () => {
    expect(stripJsonFence('```json\n{"a": 1}\n```')).toBe('{"a": 1}');
  });

  it('strips bare ``` ... ``` fence', () => {
    expect(stripJsonFence('```\n[1, 2]\n```')).toBe('[1, 2]');
  });

  it('extracts JSON when surrounded by prose', () => {
    expect(stripJsonFence('Here you go: {"x": 1} done')).toBe('{"x": 1}');
  });

  it('returns trimmed input when no JSON markers found', () => {
    expect(stripJsonFence('  hello  ')).toBe('hello');
  });
});

describe('parseAndValidateJson', () => {
  it('parses valid JSON', () => {
    expect(parseAndValidateJson('{"a": 1}', undefined, 'Anthropic')).toEqual({ a: 1 });
  });

  it('throws AuthorLlmError with INVALID_JSON_RESPONSE on parse failure', () => {
    expect(() => parseAndValidateJson('not json at all', undefined, 'OpenAI')).toThrow(/OpenAI response was not valid JSON/);
  });

  it('throws JSON_SCHEMA_VALIDATION_FAILED on schema mismatch', () => {
    expect(() =>
      parseAndValidateJson('{"x": "string"}', { type: 'object', required: ['y'] }, 'Anthropic'),
    ).toThrow(/JSON response failed schema validation/);
  });

  it('uses provider label in error message', () => {
    expect(() => parseAndValidateJson('garbage', undefined, 'GPT-Custom')).toThrow(/GPT-Custom response was not valid JSON/);
  });
});

describe('matchesSchemaType (unified, strict)', () => {
  it('rejects NaN and Infinity for type=number (strict, post-audit unification)', () => {
    expect(matchesSchemaType(NaN, 'number')).toBe(false);
    expect(matchesSchemaType(Infinity, 'number')).toBe(false);
    expect(matchesSchemaType(-Infinity, 'number')).toBe(false);
    expect(matchesSchemaType(3.14, 'number')).toBe(true);
    expect(matchesSchemaType(0, 'number')).toBe(true);
  });

  it('integer requires Number.isInteger', () => {
    expect(matchesSchemaType(3, 'integer')).toBe(true);
    expect(matchesSchemaType(3.5, 'integer')).toBe(false);
    expect(matchesSchemaType(NaN, 'integer')).toBe(false);
  });

  it('object rejects null and arrays', () => {
    expect(matchesSchemaType({}, 'object')).toBe(true);
    expect(matchesSchemaType(null, 'object')).toBe(false);
    expect(matchesSchemaType([], 'object')).toBe(false);
  });

  it('null requires literal null', () => {
    expect(matchesSchemaType(null, 'null')).toBe(true);
    expect(matchesSchemaType(undefined, 'null')).toBe(false);
    expect(matchesSchemaType(0, 'null')).toBe(false);
  });

  it('array, string, boolean basics', () => {
    expect(matchesSchemaType([], 'array')).toBe(true);
    expect(matchesSchemaType('hi', 'string')).toBe(true);
    expect(matchesSchemaType(true, 'boolean')).toBe(true);
    expect(matchesSchemaType('hi', 'boolean')).toBe(false);
  });
});

describe('redactProviderError', () => {
  it('redacts sk-* api keys', () => {
    expect(
      redactProviderError('Auth failed with sk-test-1234567890abcdefghijklmnop'),
    ).toMatch(/<redacted-api-key>/);
  });

  it('redacts sk-ant-* api keys', () => {
    expect(
      redactProviderError('Bad request with sk-ant-api03-abcdef123456789012345678'),
    ).toMatch(/<redacted-api-key>/);
  });

  it('redacts sk-svcacct-* service account keys', () => {
    expect(
      redactProviderError('Failed: sk-svcacct-LVkdBLpWfqBE9hgUcUykDQNglBTW1234567890'),
    ).toMatch(/<redacted-api-key>/);
  });

  it('redacts Bearer tokens', () => {
    expect(
      redactProviderError('Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.abcdef'),
    ).toMatch(/Bearer <redacted>/);
  });

  it('redacts org-* org IDs', () => {
    expect(
      redactProviderError('Organization org-abcdef1234567890ABCDEF not found'),
    ).toMatch(/<redacted-org-id>/);
  });

  it('passes through normal error text unchanged', () => {
    expect(redactProviderError('429 too many requests, retry after 30s')).toBe(
      '429 too many requests, retry after 30s',
    );
  });

  it('handles multiple secrets in one message', () => {
    const out = redactProviderError(
      'sk-real-1234567890abcdefghij also sk-ant-api03-anotherrealkey1234567890',
    );
    expect(out.match(/<redacted-api-key>/g)?.length).toBe(2);
  });
});
