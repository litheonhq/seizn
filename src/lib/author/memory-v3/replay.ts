import { canonicalize, sha256Hex, type JsonValue } from './canonical';
import type {
  AuthorReplayMode,
  AuthorSideEffectRecord,
  AuthorSideEffectRequest,
} from './types';

export class AuthorReplayCacheMissError extends Error {
  constructor(key: string) {
    super(`Author memory replay side effect missing for key ${key}`);
    this.name = 'AuthorReplayCacheMissError';
  }
}

export interface AuthorSideEffectStore {
  get<TOutput extends JsonValue>(
    key: string
  ): AuthorSideEffectRecord<TOutput> | undefined | Promise<AuthorSideEffectRecord<TOutput> | undefined>;
  put<TOutput extends JsonValue>(record: AuthorSideEffectRecord<TOutput>): void | Promise<void>;
}

export class InMemoryAuthorSideEffectStore implements AuthorSideEffectStore {
  private readonly records = new Map<string, AuthorSideEffectRecord>();

  get<TOutput extends JsonValue>(key: string): AuthorSideEffectRecord<TOutput> | undefined {
    return this.records.get(key) as AuthorSideEffectRecord<TOutput> | undefined;
  }

  put<TOutput extends JsonValue>(record: AuthorSideEffectRecord<TOutput>): void {
    this.records.set(record.key, record);
  }

  all(): AuthorSideEffectRecord[] {
    return [...this.records.values()].sort((a, b) => a.key.localeCompare(b.key));
  }
}

export function createAuthorSideEffectKey(request: AuthorSideEffectRequest): string {
  return sha256Hex({
    kind: request.kind,
    provider: request.provider,
    model: request.model,
    operation: request.operation,
    input: canonicalize(request.input),
    params: canonicalize(request.params ?? {}),
    seed: request.seed ?? null,
  });
}

export async function runAuthorSideEffect<TOutput extends JsonValue>(
  params: {
    request: AuthorSideEffectRequest;
    mode: AuthorReplayMode;
    store: AuthorSideEffectStore;
    live: () => Promise<TOutput> | TOutput;
    capturedAt?: string;
  }
): Promise<AuthorSideEffectRecord<TOutput>> {
  const key = createAuthorSideEffectKey(params.request);
  const existing = await params.store.get<TOutput>(key);

  if (existing) {
    return existing;
  }

  if (params.mode === 'replay') {
    throw new AuthorReplayCacheMissError(key);
  }

  const output = await params.live();
  const record: AuthorSideEffectRecord<TOutput> = {
    key,
    request: params.request,
    output,
    capturedAt: params.capturedAt ?? new Date().toISOString(),
  };

  if (params.mode === 'record') {
    await params.store.put(record);
  }

  return record;
}
