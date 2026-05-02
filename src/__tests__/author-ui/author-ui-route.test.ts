import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { isAuthorUiAccessAllowed, withAuthorUiService } from '@/lib/author/ui/route';
import { getAuthorUiService } from '@/lib/author/ui/service';
import { POST as postProjectImport } from '@/app/api/projects/[projectId]/imports/route';
import { POST as postCharacterBacklog } from '@/app/api/projects/[projectId]/characters/[characterId]/backlog/route';

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  AUTHOR_UI_ENABLED: process.env.AUTHOR_UI_ENABLED,
  AUTHOR_UI_ALLOWED_USER_IDS: process.env.AUTHOR_UI_ALLOWED_USER_IDS,
  AUTHOR_UI_ALLOWED_EMAILS: process.env.AUTHOR_UI_ALLOWED_EMAILS,
  AUTHOR_IMPORT_DISABLE_R2: process.env.AUTHOR_IMPORT_DISABLE_R2,
};

describe('Author UI route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTHOR_UI_ENABLED;
    delete process.env.AUTHOR_UI_ALLOWED_USER_IDS;
    delete process.env.AUTHOR_UI_ALLOWED_EMAILS;
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    restoreEnv('AUTHOR_UI_ENABLED', ORIGINAL_ENV.AUTHOR_UI_ENABLED);
    restoreEnv('AUTHOR_UI_ALLOWED_USER_IDS', ORIGINAL_ENV.AUTHOR_UI_ALLOWED_USER_IDS);
    restoreEnv('AUTHOR_UI_ALLOWED_EMAILS', ORIGINAL_ENV.AUTHOR_UI_ALLOWED_EMAILS);
    restoreEnv('AUTHOR_IMPORT_DISABLE_R2', ORIGINAL_ENV.AUTHOR_IMPORT_DISABLE_R2);
  });

  it('allows non-production access unless explicitly disabled', () => {
    process.env.NODE_ENV = 'test';

    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(true);

    process.env.AUTHOR_UI_ENABLED = 'false';
    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(false);
  });

  it('requires explicit production enablement and allowlist membership', () => {
    process.env.NODE_ENV = 'production';

    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(false);

    process.env.AUTHOR_UI_ENABLED = '1';
    process.env.AUTHOR_UI_ALLOWED_USER_IDS = 'user-2';
    process.env.AUTHOR_UI_ALLOWED_EMAILS = 'author@example.com';

    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(false);
    expect(isAuthorUiAccessAllowed({ id: 'user-2', email: 'user@example.com' })).toBe(true);
    expect(isAuthorUiAccessAllowed({ id: 'user-3', email: 'AUTHOR@example.com' })).toBe(true);
  });

  it('returns 403 before exposing fixture data to blocked production users', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTHOR_UI_ENABLED = '1';
    process.env.AUTHOR_UI_ALLOWED_USER_IDS = 'other-user';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'blocked-user',
      email: 'blocked@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });

    const response = await withAuthorUiService(
      new NextRequest('https://example.com/api/projects'),
      () => ({ ok: true })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Author UI is not enabled for this account' });
  });

  it('passes multipart file bytes into the Author import parser pipeline', async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTHOR_IMPORT_DISABLE_R2 = '1';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'route-upload-user',
      email: 'route-upload@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });

    const fileBytes = Buffer.from(
      '---\ntitle: Route\n---\n# Route Import\n\nParsed through route.',
      'utf8'
    );
    const request = {
      formData: async () => ({
        get: (name: string) => {
          if (name === 'file') {
            return {
              name: 'route-import.md',
              size: fileBytes.length,
              type: 'text/markdown',
              arrayBuffer: async () => fileBytes.buffer.slice(
                fileBytes.byteOffset,
                fileBytes.byteOffset + fileBytes.byteLength
              ),
            };
          }
          if (name === 'source_role') return 'canon';
          if (name === 'a_or_d_mode') return 'extract';
          return null;
        },
      }),
    } as unknown as NextRequest;

    const response = await postProjectImport(
      request,
      { params: Promise.resolve({ projectId: 'knot' }) }
    );

    if (response.status !== 200) {
      throw new Error(`Expected upload route 200, got ${response.status}: ${await response.text()}`);
    }
    const body = await response.json() as { import_id: string };
    const uploaded = getAuthorUiService('route-upload-user')
      .listImports('knot')
      .imports
      .find((item) => item.id === body.import_id);

    expect(uploaded).toMatchObject({
      file_name: 'route-import.md',
      parse_status: 'parsed',
      extract_status: 'extracted',
      parser_version: 'author-parser-md-v1',
      source_role: 'canon',
    });
    expect(uploaded?.candidate_count).toBeGreaterThan(0);
    expect(uploaded?.parsed_text_preview).toContain('Parsed through route.');
  });

  it('generates backlog candidates through the character route', async () => {
    process.env.NODE_ENV = 'test';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'route-backlog-user',
      email: 'route-backlog@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });

    const request = new NextRequest('https://example.com/api/projects/knot/characters/knot.short1.char.sori/backlog', {
      method: 'POST',
      body: JSON.stringify({ items_per_category: 5 }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await postCharacterBacklog(request, {
      params: Promise.resolve({
        projectId: 'knot',
        characterId: 'knot.short1.char.sori',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      character_id: string;
      candidate_ids: string[];
      export_markdown: string;
    };
    expect(body.character_id).toBe('knot.short1.char.sori');
    expect(body.candidate_ids).toHaveLength(20);
    expect(body.export_markdown).toContain('§X.6 backlog candidates');
  });
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
