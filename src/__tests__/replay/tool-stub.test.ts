import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueryEmbedding } from '@/lib/ai';
import { persistSnapshot } from '@/lib/replay/snapshot';
import { withReplayCapture } from '@/lib/replay/capture';
import {
  buildToolStubHash,
  buildToolStubKey,
  loadToolStubs,
  recordToolCall,
  ReplayStubMissingError,
} from '@/lib/replay/tool-stub';

const supabaseState = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    from: supabaseState.from,
  })),
}));

vi.mock('@/lib/redis', () => ({
  getCachedEmbedding: vi.fn().mockResolvedValue(null),
  setCachedEmbedding: vi.fn().mockResolvedValue(undefined),
}));

describe('replay tool stubs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    supabaseState.upsert.mockResolvedValue({ error: null });
    supabaseState.maybeSingle.mockResolvedValue({
      data: { tool_calls: [] },
      error: null,
    });
    supabaseState.from.mockImplementation(() => ({
      upsert: supabaseState.upsert,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: supabaseState.maybeSingle,
        }),
      }),
    }));
  });

  it('records and loads a stub round-trip with the same hash', async () => {
    const traceId = '00000000-0000-4000-8000-000000000101';
    const recorded = await withReplayCapture(
      {
        traceId,
        endpoint: '/api/replay-test',
        requestBody: { query: 'gate' },
      },
      async () =>
        recordToolCall(traceId, {
          name: 'llm.test.model',
          input: { b: 2, a: 1 },
          output: { answer: 'open' },
          latencyMs: 12.4,
        })
    );

    supabaseState.maybeSingle.mockResolvedValueOnce({
      data: { tool_calls: recorded.capture.toolCalls },
      error: null,
    });

    const stubs = await loadToolStubs(traceId);
    const key = buildToolStubKey('llm.test.model', { a: 1, b: 2 });
    const loaded = stubs.get(key);

    expect(recorded.result.stubHash).toBe(buildToolStubHash('llm.test.model', { a: 1, b: 2 }));
    expect(recorded.capture.toolCalls).toHaveLength(1);
    expect(loaded?.output).toEqual({ answer: 'open' });
    expect(loaded?.latencyMs).toBe(12);
    expect(loaded?.stubHash).toBe(recorded.result.stubHash);
  });

  it('uses the same stub hash for equivalent canonical input', () => {
    expect(buildToolStubHash('tool.weather', { city: 'Seoul', units: 'metric' })).toBe(
      buildToolStubHash('tool.weather', { units: 'metric', city: 'Seoul' })
    );
  });

  it('returns replay stub output without hitting the live embedding fetch path', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const input = {
      model: 'voyage-3',
      input: 'where is the old gate?',
      input_type: 'query',
    };
    const output = [0.11, 0.22, 0.33];
    const stubs = new Map([
      [buildToolStubKey('embedding.voyage.voyage-3', input), { output, latencyMs: 7 }],
    ]);

    const replayed = await withReplayCapture(
      {
        traceId: '00000000-0000-4000-8000-000000000102',
        endpoint: '/api/replay-test',
        requestBody: input,
        mode: 'replay',
        stubs,
      },
      () => createQueryEmbedding(input.input)
    );

    expect(replayed.result).toEqual(output);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replayed.capture.toolCalls[0].latencyMs).toBe(7);
  });

  it('throws ReplayStubMissingError when replay mode lacks a matching stub', async () => {
    await expect(
      withReplayCapture(
        {
          traceId: '00000000-0000-4000-8000-000000000103',
          endpoint: '/api/replay-test',
          requestBody: {},
          mode: 'replay',
          stubs: new Map(),
        },
        () => createQueryEmbedding('missing stub')
      )
    ).rejects.toBeInstanceOf(ReplayStubMissingError);
  });

  it('populates stub_hash when a snapshot with tool calls is persisted', async () => {
    const traceId = '00000000-0000-4000-8000-000000000104';
    const { capture } = await withReplayCapture(
      {
        traceId,
        endpoint: '/api/replay-test',
        requestBody: { prompt: 'remember gate' },
      },
      async () => {
        recordToolCall(traceId, {
          name: 'llm.test.model',
          input: { prompt: 'remember gate' },
          output: { text: 'gate remembered' },
          latencyMs: 19,
        });
      }
    );

    await persistSnapshot(capture, {
      organizationId: '00000000-0000-4000-8000-000000000201',
      endpoint: '/api/replay-test',
      requestBody: { prompt: 'remember gate' },
      responseBody: { ok: true },
      durationMs: 24,
    });

    const [payload] = supabaseState.upsert.mock.calls[0];
    expect(payload.stub_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.tool_calls[0].input).toEqual({ prompt: 'remember gate' });
    expect(payload.tool_calls[0].output).toEqual({ text: 'gate remembered' });
  });
});
