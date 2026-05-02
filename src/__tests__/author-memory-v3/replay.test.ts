import { describe, expect, it } from 'vitest';

import {
  AuthorReplayCacheMissError,
  InMemoryAuthorSideEffectStore,
  createAuthorSideEffectKey,
  runAuthorSideEffect,
  type AuthorSideEffectRequest,
} from '@/lib/author/memory-v3';

const request: AuthorSideEffectRequest = {
  kind: 'llm',
  provider: 'anthropic',
  model: 'claude-opus-4.7',
  operation: 'extract-canon-candidates',
  input: { text: 'Sori is a student.' },
  params: { temperature: 0 },
  seed: 42,
};

describe('Author Memory v3 replay side effects', () => {
  it('creates a stable side-effect key from canonical request data', () => {
    const reordered: AuthorSideEffectRequest = {
      ...request,
      params: { temperature: 0 },
      input: { text: 'Sori is a student.' },
    };

    expect(createAuthorSideEffectKey(request)).toBe(createAuthorSideEffectKey(reordered));
  });

  it('records a live side effect in record mode', async () => {
    const store = new InMemoryAuthorSideEffectStore();
    const record = await runAuthorSideEffect({
      request,
      mode: 'record',
      store,
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: () => ({ candidates: ['Sori is a student'] }),
    });

    expect(store.get(record.key)).toEqual(record);
    expect(record.output).toEqual({ candidates: ['Sori is a student'] });
  });

  it('replays an existing side effect without calling live provider', async () => {
    const store = new InMemoryAuthorSideEffectStore();
    const first = await runAuthorSideEffect({
      request,
      mode: 'record',
      store,
      capturedAt: '2026-05-02T00:00:00.000Z',
      live: () => ({ candidates: ['recorded'] }),
    });

    const replayed = await runAuthorSideEffect({
      request,
      mode: 'replay',
      store,
      live: () => {
        throw new Error('live provider should not be called');
      },
    });

    expect(replayed).toEqual(first);
  });

  it('fails closed on replay cache miss', async () => {
    await expect(
      runAuthorSideEffect({
        request,
        mode: 'replay',
        store: new InMemoryAuthorSideEffectStore(),
        live: () => ({ candidates: ['live fallback must not happen'] }),
      })
    ).rejects.toBeInstanceOf(AuthorReplayCacheMissError);
  });
});
