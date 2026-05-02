import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { isAuthorUiAccessAllowed, withAuthorUiService } from '@/lib/author/ui/route';
import { AUTHOR_IMPORT_MAX_BYTES, getAuthorUiService } from '@/lib/author/ui/service';
import { POST as postProjectImport } from '@/app/api/projects/[projectId]/imports/route';
import { POST as postCharacterBacklog } from '@/app/api/projects/[projectId]/characters/[characterId]/backlog/route';
import { GET as getProjectAudit } from '@/app/api/projects/[projectId]/audit/route';

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

  it('rejects cross-origin Author UI mutations before invoking handlers', async () => {
    process.env.NODE_ENV = 'test';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'csrf-user',
      email: 'csrf@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });
    const handler = vi.fn(() => ({ ok: true }));

    const response = await withAuthorUiService(
      new NextRequest('https://example.com/api/projects', {
        method: 'POST',
        headers: { origin: 'https://attacker.example' },
      }),
      handler
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
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
      method: 'POST',
      headers: new Headers({ origin: 'http://localhost:3000' }),
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

  it('rejects oversized Author imports before buffering file bytes', async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTHOR_IMPORT_DISABLE_R2 = '1';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'route-oversize-user',
      email: 'route-oversize@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const request = {
      method: 'POST',
      headers: new Headers({ origin: 'http://localhost:3000' }),
      formData: async () => ({
        get: (name: string) => {
          if (name === 'file') {
            return {
              name: 'too-large.md',
              size: AUTHOR_IMPORT_MAX_BYTES + 1,
              type: 'text/markdown',
              arrayBuffer,
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

    expect(response.status).toBe(200);
    expect(arrayBuffer).not.toHaveBeenCalled();
    const body = await response.json() as { import_id: string };
    const uploaded = getAuthorUiService('route-oversize-user')
      .listImports('knot')
      .imports
      .find((item) => item.id === body.import_id);

    expect(uploaded).toMatchObject({
      file_name: 'too-large.md',
      parse_status: 'failed',
      extract_status: 'failed',
      error_message: 'file_too_large',
    });
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
      headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
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
  it('exposes audit log search and replay through the project audit route', async () => {
    process.env.NODE_ENV = 'test';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'route-audit-user',
      email: 'route-audit@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });

    const service = getAuthorUiService('route-audit-user');
    const run = service.runSimulation('knot', {
      scene_input: {
        text: 'Route audit scene.',
        perspective: 'knot.short1.char.sori',
        candidate_count: 2,
      },
    });

    const listResponse = await getProjectAudit(
      new NextRequest('https://example.com/api/projects/knot/audit?event_type=simulation.run&limit=10'),
      { params: Promise.resolve({ projectId: 'knot' }) }
    );

    expect(listResponse.status).toBe(200);
    const listBody = await listResponse.json() as { audit_logs: Array<Record<string, unknown>> };
    expect(listBody.audit_logs.some((entry) => entry.decision_id === run.decision_id)).toBe(true);
    expect(listBody.audit_logs.every((entry) => entry.event_type === 'simulation.run')).toBe(true);

    const replayResponse = await getProjectAudit(
      new NextRequest(`https://example.com/api/projects/knot/audit?replay=1&decision_id=${run.decision_id}`),
      { params: Promise.resolve({ projectId: 'knot' }) }
    );
    const replayBody = await replayResponse.json() as { replayStatus: string; chainLength: number };
    expect(replayBody.replayStatus).toBe('deterministic');
    expect(replayBody.chainLength).toBeGreaterThanOrEqual(1);
  });
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
