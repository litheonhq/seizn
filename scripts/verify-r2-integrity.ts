import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
  type _Object,
} from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';

type Role = 'source' | 'target';

interface BucketConfig {
  role: Role;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  region: string;
}

interface ListedObject {
  key: string;
  size: number;
  etag?: string;
  lastModified?: string;
}

interface DigestResult extends ListedObject {
  sha256: string;
}

interface CompareResult {
  key: string;
  status: 'matched' | 'missing_target' | 'size_mismatch' | 'hash_mismatch' | 'read_error';
  sourceSize?: number;
  targetSize?: number;
  sourceSha256?: string;
  targetSha256?: string;
  error?: string;
}

interface Args {
  prefix?: string;
  limit?: number;
  jsonPath?: string;
  help: boolean;
}

const USAGE = `Usage:
  npx ts-node --project tsconfig.node.json scripts/verify-r2-integrity.ts [--prefix <object-prefix>] [--limit <n>] [--json <path>]

Verifies SHA256 integrity between the temporary Author Memory v3 R2 bucket and
the Litheon target bucket. The report never includes credential values.

Source env:
  R2_AUTHOR_ACCOUNT_ID or R2_ACCOUNT_ID
  R2_AUTHOR_ACCESS_KEY_ID or R2_ACCESS_KEY_ID
  R2_AUTHOR_SECRET_ACCESS_KEY or R2_SECRET_ACCESS_KEY
  R2_AUTHOR_BUCKET_NAME or R2_AUTHOR_BUCKET or R2_BUCKET

Target env:
  R2_AUTHOR_NEW_ACCOUNT_ID or R2_NEW_ACCOUNT_ID
  R2_AUTHOR_NEW_ACCESS_KEY_ID or R2_NEW_ACCESS_KEY_ID
  R2_AUTHOR_NEW_SECRET_ACCESS_KEY or R2_NEW_SECRET_ACCESS_KEY
  R2_AUTHOR_NEW_BUCKET_NAME or R2_AUTHOR_NEW_BUCKET or R2_NEW_BUCKET
`;

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
      continue;
    }
    if (arg === '--prefix') {
      const value = argv[index + 1];
      if (!value) throw new Error('--prefix requires a value');
      args.prefix = value.replace(/^\/+/, '');
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      const value = argv[index + 1];
      if (!value || !/^\d+$/.test(value)) throw new Error('--limit requires a positive integer');
      args.limit = Number(value);
      index += 1;
      continue;
    }
    if (arg === '--json') {
      const value = argv[index + 1];
      if (!value) throw new Error('--json requires a path');
      args.jsonPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function envAny(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function requireEnv(...names: string[]): string {
  const value = envAny(...names);
  if (!value) {
    throw new Error(`Missing required env: ${names.join(' or ')}`);
  }
  return value;
}

function readConfig(role: Role): BucketConfig {
  const isSource = role === 'source';
  const accountId = isSource
    ? requireEnv('R2_AUTHOR_ACCOUNT_ID', 'R2_ACCOUNT_ID')
    : requireEnv('R2_AUTHOR_NEW_ACCOUNT_ID', 'R2_NEW_ACCOUNT_ID');
  const endpoint = isSource
    ? envAny('R2_AUTHOR_ENDPOINT', 'R2_ENDPOINT') ?? `https://${accountId}.r2.cloudflarestorage.com`
    : envAny('R2_AUTHOR_NEW_ENDPOINT', 'R2_NEW_ENDPOINT') ?? `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    role,
    accountId,
    accessKeyId: isSource
      ? requireEnv('R2_AUTHOR_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID')
      : requireEnv('R2_AUTHOR_NEW_ACCESS_KEY_ID', 'R2_NEW_ACCESS_KEY_ID'),
    secretAccessKey: isSource
      ? requireEnv('R2_AUTHOR_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY')
      : requireEnv('R2_AUTHOR_NEW_SECRET_ACCESS_KEY', 'R2_NEW_SECRET_ACCESS_KEY'),
    bucket: isSource
      ? requireEnv('R2_AUTHOR_BUCKET_NAME', 'R2_AUTHOR_BUCKET', 'R2_BUCKET')
      : requireEnv('R2_AUTHOR_NEW_BUCKET_NAME', 'R2_AUTHOR_NEW_BUCKET', 'R2_NEW_BUCKET_NAME', 'R2_NEW_BUCKET', 'R2_BUCKET_NEW'),
    region: isSource
      ? envAny('R2_AUTHOR_REGION', 'R2_REGION') ?? 'auto'
      : envAny('R2_AUTHOR_NEW_REGION', 'R2_NEW_REGION') ?? 'auto',
    endpoint,
  };
}

function createClient(config: BucketConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

async function listObjects(client: S3Client, config: BucketConfig, prefix?: string, limit?: number): Promise<Map<string, ListedObject>> {
  const objects = new Map<string, ListedObject>();
  let continuationToken: string | undefined;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));

    for (const item of response.Contents ?? []) {
      if (!item.Key) continue;
      objects.set(item.Key, toListedObject(item));
      if (limit && objects.size >= limit) return objects;
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return objects;
}

function toListedObject(item: _Object): ListedObject {
  return {
    key: item.Key ?? '',
    size: item.Size ?? 0,
    etag: item.ETag?.replace(/^"|"$/g, ''),
    lastModified: item.LastModified?.toISOString(),
  };
}

async function digestObject(client: S3Client, config: BucketConfig, object: ListedObject): Promise<DigestResult> {
  const response = await client.send(new GetObjectCommand({
    Bucket: config.bucket,
    Key: object.key,
  }));
  const buffer = await bodyToBuffer(response.Body);
  return {
    ...object,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    size: buffer.length,
  };
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);

  const maybeBlob = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeBlob.transformToByteArray === 'function') {
    const bytes = await maybeBlob.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function compareObjects(input: {
  sourceClient: S3Client;
  targetClient: S3Client;
  sourceConfig: BucketConfig;
  targetConfig: BucketConfig;
  sourceObjects: Map<string, ListedObject>;
  targetObjects: Map<string, ListedObject>;
}): Promise<CompareResult[]> {
  const results: CompareResult[] = [];

  for (const sourceObject of input.sourceObjects.values()) {
    const targetObject = input.targetObjects.get(sourceObject.key);
    if (!targetObject) {
      results.push({
        key: sourceObject.key,
        status: 'missing_target',
        sourceSize: sourceObject.size,
      });
      continue;
    }

    if (sourceObject.size !== targetObject.size) {
      results.push({
        key: sourceObject.key,
        status: 'size_mismatch',
        sourceSize: sourceObject.size,
        targetSize: targetObject.size,
      });
      continue;
    }

    try {
      const [sourceDigest, targetDigest] = await Promise.all([
        digestObject(input.sourceClient, input.sourceConfig, sourceObject),
        digestObject(input.targetClient, input.targetConfig, targetObject),
      ]);

      results.push({
        key: sourceObject.key,
        status: sourceDigest.sha256 === targetDigest.sha256 ? 'matched' : 'hash_mismatch',
        sourceSize: sourceDigest.size,
        targetSize: targetDigest.size,
        sourceSha256: sourceDigest.sha256,
        targetSha256: targetDigest.sha256,
      });
    } catch (error) {
      results.push({
        key: sourceObject.key,
        status: 'read_error',
        sourceSize: sourceObject.size,
        targetSize: targetObject.size,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

function writeReport(path: string, data: unknown): void {
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Wrote integrity report: ${target}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  const sourceConfig = readConfig('source');
  const targetConfig = readConfig('target');
  if (sourceConfig.bucket === targetConfig.bucket && sourceConfig.endpoint === targetConfig.endpoint) {
    throw new Error('Source and target resolve to the same bucket and endpoint.');
  }

  const sourceClient = createClient(sourceConfig);
  const targetClient = createClient(targetConfig);
  const sourceObjects = await listObjects(sourceClient, sourceConfig, args.prefix, args.limit);
  const targetObjects = await listObjects(targetClient, targetConfig, args.prefix, args.limit);

  console.log(`Source objects listed: ${sourceObjects.size}`);
  console.log(`Target objects listed: ${targetObjects.size}`);

  const results = await compareObjects({
    sourceClient,
    targetClient,
    sourceConfig,
    targetConfig,
    sourceObjects,
    targetObjects,
  });

  const matched = results.filter((result) => result.status === 'matched').length;
  const failed = results.filter((result) => result.status !== 'matched');
  const extraTargetKeys = [...targetObjects.keys()].filter((key) => !sourceObjects.has(key));

  const report = {
    generatedAt: new Date().toISOString(),
    prefix: args.prefix ?? null,
    limit: args.limit ?? null,
    sourceBucket: sourceConfig.bucket,
    targetBucket: targetConfig.bucket,
    matched,
    failed: failed.length,
    extraTargetObjects: extraTargetKeys.length,
    results,
  };

  if (args.jsonPath) {
    writeReport(args.jsonPath, report);
  }

  if (failed.length > 0) {
    console.error(`Integrity check failed: ${failed.length} object(s) did not match.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Integrity check passed: ${matched} object(s) matched.`);
  if (extraTargetKeys.length > 0) {
    console.warn(`Target has ${extraTargetKeys.length} extra object(s) outside the source set.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
