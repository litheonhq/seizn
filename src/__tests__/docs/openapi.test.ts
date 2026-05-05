import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type OpenApiDoc = {
  openapi: string;
  info: { title: string; version: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
  components: {
    securitySchemes?: Record<string, { type: string; scheme?: string }>;
    schemas?: Record<string, unknown>;
  };
};

function loadDoc(): OpenApiDoc {
  const path = resolve(process.cwd(), 'public/openapi.yaml');
  const text = readFileSync(path, 'utf-8');
  return parse(text) as OpenApiDoc;
}

describe('public/openapi.yaml', () => {
  const doc = loadDoc();

  it('declares OpenAPI 3.x and version 1.0', () => {
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.version).toBe('1.0');
    expect(doc.info.title).toBe('Seizn API');
  });

  it('serves the production base URL', () => {
    expect(doc.servers?.[0]?.url).toBe('https://seizn.com/api/v1');
  });

  it('declares Bearer auth as the default security scheme', () => {
    const bearer = doc.components.securitySchemes?.BearerAuth;
    expect(bearer?.type).toBe('http');
    expect(bearer?.scheme).toBe('bearer');
  });

  it('declares the RFC 7807 Problem schema', () => {
    expect(doc.components.schemas?.Problem).toBeDefined();
  });

  it('exposes all 10 Track 2 endpoints', () => {
    const expected = [
      ['get', '/projects'],
      ['post', '/projects'],
      ['get', '/projects/{id}/recall'],
      ['get', '/projects/{id}/recall/{entityId}/mentions'],
      ['post', '/projects/{id}/conflicts/check'],
      ['post', '/projects/{id}/canon/{entityId}/approve'],
      ['get', '/projects/{id}/search'],
      ['get', '/projects/{id}/timeline'],
      ['get', '/projects/{id}/graph'],
      ['get', '/usage'],
    ] as const;

    for (const [method, path] of expected) {
      const node = doc.paths[path];
      expect(node, `path ${method.toUpperCase()} ${path} missing`).toBeDefined();
      expect(node?.[method], `verb ${method} for ${path} missing`).toBeDefined();
    }
  });

  it('returns Problem on the auth-required failure paths', () => {
    const post = doc.paths['/projects'].post as { responses?: Record<string, unknown> };
    expect(post.responses?.['429']).toBeDefined();
    expect(post.responses?.['402']).toBeDefined();
  });
});
