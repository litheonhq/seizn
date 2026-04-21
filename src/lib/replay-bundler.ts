import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildSnapshotContentHash, loadSnapshot, type ReplaySnapshotRecord } from '@/lib/replay/snapshot';
import { logServerWarn } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

const REPLAY_BUCKET = 'replays';
const SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface ReplayBundleResult {
  traceId: string;
  organizationId: string;
  bundleUrl: string;
  expiresAt: string;
  storagePath: string;
  bundleHash: string;
  replayHash: string;
  npcsAffected: string[];
  canonViolationCount: number;
}

interface BundleFile {
  name: string;
  content: Buffer;
}

interface BundleContext {
  snapshot: ReplaySnapshotRecord;
  fallTraces: unknown[];
  canonViolations: unknown[];
  moderationHits: unknown[];
  npcsAffected: string[];
}

function getSigningSecret(): string {
  return (
    process.env.REPLAY_BUNDLE_SIGNING_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    ''
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value), null, 2);
}

function sortStable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortStable);
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortStable(input[key]);
        return acc;
      }, {});
  }
  return value;
}

function sha256(buffer: Buffer | string): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hmacSha256(value: string): string {
  const secret = getSigningSecret();
  if (!secret) {
    throw new Error('REPLAY_BUNDLE_SIGNING_SECRET or AUTH_SECRET is required to sign replay bundles');
  }
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || /relation .* does not exist/i.test(error.message || '');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function bestEffortQuery<T>(
  label: string,
  query: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (!isMissingRelation(error)) {
      logServerWarn(`[replay-bundler] ${label} query failed`, error);
    }
    return [];
  }
  return (Array.isArray(data) ? data : []) as T[];
}

function collectIds(value: unknown, keys: Set<string>, output: Set<string>) {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectIds(entry, keys, output));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && typeof entryValue === 'string' && entryValue.trim()) {
      output.add(entryValue.trim());
    }
    collectIds(entryValue, keys, output);
  }
}

function extractNpcsAffected(snapshot: ReplaySnapshotRecord): string[] {
  const ids = new Set<string>();
  collectIds(snapshot.request_body, new Set(['npc_id', 'npcId', 'entity_id', 'entityId']), ids);
  collectIds(snapshot.response_body, new Set(['npc_id', 'npcId', 'entity_id', 'entityId']), ids);
  collectIds(snapshot.memory_reads, new Set(['npc_id', 'npcId', 'entity_id', 'entityId']), ids);
  collectIds(snapshot.memory_writes, new Set(['npc_id', 'npcId', 'entity_id', 'entityId']), ids);
  return Array.from(ids).slice(0, 50);
}

function extractMemoryIds(snapshot: ReplaySnapshotRecord): string[] {
  const ids = new Set<string>();
  collectIds(snapshot.memory_writes, new Set(['id', 'memory_id', 'memoryId']), ids);
  collectIds(snapshot.memory_reads, new Set(['id', 'memory_id', 'memoryId']), ids);
  return Array.from(ids).filter(isUuid).slice(0, 200);
}

async function loadBundleContext(
  supabase: SupabaseClient,
  traceId: string,
  organizationId: string
): Promise<BundleContext> {
  const snapshot = await loadSnapshot(traceId, organizationId);
  if (!snapshot) {
    throw new Error('Replay snapshot not found');
  }

  const fallTraceQuery = isUuid(traceId)
    ? supabase
        .from('fall_retrieval_traces')
        .select('*')
        .or(`id.eq.${traceId},request_id.eq.${traceId}`)
        .limit(10)
    : supabase
        .from('fall_retrieval_traces')
        .select('*')
        .eq('request_id', traceId)
        .limit(10);

  const memoryIds = extractMemoryIds(snapshot);
  const [fallTraces, canonViolations, moderationHits] = await Promise.all([
    bestEffortQuery<unknown>('fall traces', fallTraceQuery),
    memoryIds.length > 0
      ? bestEffortQuery<unknown>(
          'canon violations',
          supabase
            .from('canon_violations')
            .select('*')
            .in('memory_id', memoryIds)
            .limit(200)
        )
      : [],
    memoryIds.length > 0
      ? bestEffortQuery<unknown>(
          'moderation hits',
          supabase
            .from('memories')
            .select('id, moderation_status, moderation_scores, created_at')
            .in('id', memoryIds)
            .neq('moderation_status', 'clean')
            .limit(200)
        )
      : [],
  ]);

  return {
    snapshot,
    fallTraces,
    canonViolations,
    moderationHits,
    npcsAffected: extractNpcsAffected(snapshot),
  };
}

function getReplayHash(snapshot: ReplaySnapshotRecord): string {
  return snapshot.content_hash || buildSnapshotContentHash(snapshot);
}

function buildBundleFiles(context: BundleContext): { files: BundleFile[]; bundleHash: string; signature: string } {
  const replayHash = getReplayHash(context.snapshot);
  const payloads = [
    {
      name: 'snapshot.json',
      value: context.snapshot,
    },
    {
      name: 'events.json',
      value: {
        fall_retrieval_traces: context.fallTraces,
        memory_reads: context.snapshot.memory_reads,
        memory_writes: context.snapshot.memory_writes,
        tool_calls: context.snapshot.tool_calls,
      },
    },
    {
      name: 'canon.json',
      value: {
        violations: context.canonViolations,
      },
    },
    {
      name: 'moderation.json',
      value: {
        hits: context.moderationHits,
      },
    },
  ];

  const files = payloads.map((payload) => ({
    name: payload.name,
    content: Buffer.from(`${stableJson(payload.value)}\n`, 'utf8'),
  }));
  const fileHashes = files.map((file) => ({
    name: file.name,
    sha256: sha256(file.content),
    bytes: file.content.length,
  }));
  const bundleHash = sha256(stableJson(fileHashes));
  const signature = hmacSha256(bundleHash);
  const manifest = {
    schema: 'seizn.replay.bundle.v1',
    trace_id: context.snapshot.trace_id,
    organization_id: context.snapshot.organization_id,
    replay_hash: replayHash,
    bundle_hash: bundleHash,
    signature_algorithm: 'hmac-sha256',
    signature,
    created_at: new Date().toISOString(),
    files: fileHashes,
  };

  files.unshift({
    name: 'manifest.json',
    content: Buffer.from(`${stableJson(manifest)}\n`, 'utf8'),
  });

  return { files, bundleHash, signature };
}

async function ensureReplayBucket(supabase: SupabaseClient) {
  const { error } = await supabase.storage.createBucket(REPLAY_BUCKET, { public: false });
  if (error && !/already exists|resource already exists/i.test(error.message || '')) {
    logServerWarn('[replay-bundler] Failed to create replay bucket', error);
  }
}

export async function createReplayBundle(params: {
  traceId: string;
  organizationId: string;
  provider?: string | null;
  externalIssueKey?: string | null;
  createdBy?: string | null;
}): Promise<ReplayBundleResult> {
  const supabase = createServerClient();
  const context = await loadBundleContext(supabase, params.traceId, params.organizationId);
  const { files, bundleHash } = buildBundleFiles(context);
  const zip = createZip(files);
  const storagePath = `bundles/${params.organizationId}/${params.traceId}/${bundleHash}.zip`;
  const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();

  await ensureReplayBucket(supabase);
  const { error: uploadError } = await supabase.storage
    .from(REPLAY_BUCKET)
    .upload(storagePath, zip, {
      contentType: 'application/zip',
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Failed to upload replay bundle: ${uploadError.message}`);
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(REPLAY_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed?.signedUrl) {
    throw new Error(`Failed to create replay bundle signed URL: ${signedError?.message || 'missing URL'}`);
  }

  await supabase.from('replay_bundle_exports').insert({
    trace_id: params.traceId,
    organization_id: params.organizationId,
    storage_path: `${REPLAY_BUCKET}/${storagePath}`,
    bundle_hash: bundleHash,
    signed_url_expires_at: expiresAt,
    provider: params.provider || null,
    external_issue_key: params.externalIssueKey || null,
    created_by: params.createdBy || null,
  });

  return {
    traceId: params.traceId,
    organizationId: params.organizationId,
    bundleUrl: signed.signedUrl,
    expiresAt,
    storagePath: `${REPLAY_BUCKET}/${storagePath}`,
    bundleHash,
    replayHash: getReplayHash(context.snapshot),
    npcsAffected: context.npcsAffected,
    canonViolationCount: context.canonViolations.length,
  };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

function createZip(files: BundleFile[]): Buffer {
  const now = dosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = file.content;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(now.time, 10);
    local.writeUInt16LE(now.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(now.time, 12);
    central.writeUInt16LE(now.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, end]);
}
