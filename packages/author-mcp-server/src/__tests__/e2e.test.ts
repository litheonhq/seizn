import { describe, expect, it, vi } from 'vitest';
import {
  SeiznApiError,
  SeiznAuthorClient,
  type RecallEntity,
  type ConflictHit,
  type GraphSubset,
  type TimelineEntry,
} from '../api-client.js';
import { SEIZN_AUTHOR_MCP_TOOLS, listSeiznAuthorMcpTools } from '../server.js';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

function recallFixture(): RecallEntity {
  return {
    id: 'saebyeok-entity-primary',
    type: 'character',
    canonicalName: 'Seoyun',
    lastMentions: [
      { chapter: 'ch4', line: 2, snippet: 'works as a reporter', timestamp: '2026-05-06T00:00:00.000Z' },
    ],
    currentState: { occupation: 'reporter' },
    pendingConflictIds: [],
    confidence: 0.95,
    approvalStatus: 'approved',
  };
}

function conflictFixture(): ConflictHit {
  return {
    id: 'conflict-1',
    severity: 'P1',
    kind: 'canon_conflict',
    episode: null,
    title: 'Reporter vs novelist',
    rationale: 'Ch.4 establishes Seoyun as a reporter; this scene casts her as a novelist.',
    refs: ['author-canon'],
  };
}

function timelineFixture(): TimelineEntry {
  return {
    id: 'tl-1',
    chapter: 'ch4',
    ordinal: 1,
    beats: [{ id: 'beat-1', summary: 'Seoyun files her first byline.', entities: ['saebyeok-entity-primary'] }],
  };
}

function graphFixture(): GraphSubset {
  return {
    nodes: [
      { id: 'saebyeok-entity-primary', label: 'Seoyun', type: 'character' },
      { id: 'mentor-1', label: 'Mentor', type: 'character' },
    ],
    edges: [{ from: 'saebyeok-entity-primary', to: 'mentor-1', kind: 'mentor', weight: 0.8 }],
  };
}

function setup(fetchMock: FetchMock): SeiznAuthorClient {
  return new SeiznAuthorClient({
    apiKey: 'sk_seizn_test_token',
    baseUrl: 'https://test.seizn.com/api/v1',
    fetch: fetchMock as unknown as typeof fetch,
  });
}

describe('@seizn/author-mcp-server e2e (mock REST surface)', () => {
  it('lists exactly the six Track 2 tools by name', () => {
    expect(SEIZN_AUTHOR_MCP_TOOLS).toEqual([
      'seizn_author_recall',
      'seizn_author_check',
      'seizn_author_remember',
      'seizn_author_search',
      'seizn_author_timeline',
      'seizn_author_graph',
    ]);
    expect(listSeiznAuthorMcpTools()).toEqual([...SEIZN_AUTHOR_MCP_TOOLS]);
  });

  it('recall: GET /projects/:id/recall?q=… and returns entities', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({ entities: [recallFixture()] }),
    );
    const client = setup(fetchMock);
    const entities = await client.recall('saebyeok-main', 'Seoyun');
    expect(entities).toHaveLength(1);
    expect(entities[0].canonicalName).toBe('Seoyun');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.seizn.com/api/v1/projects/saebyeok-main/recall?q=Seoyun');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer sk_seizn_test_token' });
  });

  it('check: POST /projects/:id/conflicts/check with body and returns conflicts', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({ conflicts: [conflictFixture()] }),
    );
    const client = setup(fetchMock);
    const conflicts = await client.check('saebyeok-main', 'Seoyun decides to write a novel.');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('P1');
    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toContain('Seoyun decides');
  });

  it('remember: POST /canon/:entityId/approve and forwards the fact', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({ entityId: 'saebyeok-entity-primary', status: 'approved' }),
    );
    const client = setup(fetchMock);
    const result = await client.remember(
      'saebyeok-main',
      'saebyeok-entity-primary',
      'Reporter as of Ch.4',
    );
    expect(result.status).toBe('approved');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://test.seizn.com/api/v1/projects/saebyeok-main/canon/saebyeok-entity-primary/approve',
    );
  });

  it('search: GET /search consumes the paginated `data` shape', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({ data: [recallFixture()], has_more: false }),
    );
    const client = setup(fetchMock);
    const entities = await client.search('saebyeok-main', 'reporter', 5);
    expect(entities).toHaveLength(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.seizn.com/api/v1/projects/saebyeok-main/search?q=reporter&limit=5');
  });

  it('timeline: GET /timeline consumes the paginated `data` shape', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({ data: [timelineFixture()], has_more: false }),
    );
    const client = setup(fetchMock);
    const timeline = await client.timeline('saebyeok-main', 'ch4', 'ch7');
    expect(timeline).toHaveLength(1);
    expect(timeline[0].chapter).toBe('ch4');
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://test.seizn.com/api/v1/projects/saebyeok-main/timeline?from=ch4&to=ch7');
  });

  it('graph: GET /graph?root=… returns nodes + edges', async () => {
    const fetchMock: FetchMock = vi.fn(async () => jsonResponse(graphFixture()));
    const client = setup(fetchMock);
    const subset = await client.graph('saebyeok-main', 'saebyeok-entity-primary');
    expect(subset.nodes).toHaveLength(2);
    expect(subset.edges).toHaveLength(1);
  });

  it('rate limit (429) surfaces as SeiznApiError with status 429', async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse(
        {
          type: 'https://seizn.com/errors/rate-limited',
          title: 'Rate limit exceeded',
          status: 429,
          code: 'rate_limited',
          detail: 'Too many requests',
          instance: '/api/v1/projects/saebyeok-main/recall',
        },
        { status: 429, headers: { 'retry-after': '60', 'content-type': 'application/problem+json' } },
      ),
    );
    const client = setup(fetchMock);
    await expect(client.recall('saebyeok-main', 'Seoyun')).rejects.toBeInstanceOf(SeiznApiError);
    try {
      await client.recall('saebyeok-main', 'Seoyun');
    } catch (error) {
      const apiError = error as SeiznApiError;
      expect(apiError.status).toBe(429);
      expect(apiError.body).toMatchObject({ code: 'rate_limited' });
    }
  });
});
