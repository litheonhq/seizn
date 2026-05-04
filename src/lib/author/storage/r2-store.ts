import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface AuthorR2PutObjectInput {
  key: string;
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface AuthorR2ObjectRef {
  bucket: string;
  key: string;
  endpoint: string;
  owner: string;
  migrateBy?: string;
}

export class AuthorR2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorR2ConfigError';
  }
}

interface AuthorR2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
  owner: string;
  migrateBy?: string;
}

export class AuthorR2Store {
  private readonly config: AuthorR2Config;
  private readonly client: S3Client;

  constructor(config = readAuthorR2Config()) {
    this.config = config;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  async putObject(input: AuthorR2PutObjectInput): Promise<AuthorR2ObjectRef> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: {
        owner: this.config.owner,
        ...(this.config.migrateBy ? { migrate_by: this.config.migrateBy } : {}),
        ...(input.metadata ?? {}),
      },
    }));

    return this.ref(input.key);
  }

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));

    if (!response.Body) {
      return Buffer.alloc(0);
    }

    if ('transformToByteArray' in response.Body) {
      const bytes = await response.Body.transformToByteArray();
      return Buffer.from(bytes);
    }

    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    }));
  }

  async getSignedReadUrl(key: string, expiresInSeconds = 900): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  }

  ref(key: string): AuthorR2ObjectRef {
    return {
      bucket: this.config.bucket,
      key,
      endpoint: this.config.endpoint,
      owner: this.config.owner,
      migrateBy: this.config.migrateBy,
    };
  }
}

export async function putAuthorImportObject(input: AuthorR2PutObjectInput): Promise<AuthorR2ObjectRef> {
  if (process.env.NODE_ENV !== 'production' && process.env.AUTHOR_IMPORT_DISABLE_R2 === '1') {
    return {
      bucket: 'local-author-import-test',
      key: input.key,
      endpoint: 'memory://author-import-test',
      owner: 'local_test',
    };
  }

  return new AuthorR2Store().putObject(input);
}

export function buildAuthorR2ObjectKey(input: {
  projectId: string;
  importId: string;
  fileName: string;
}): string {
  return [
    safeSegment(input.projectId),
    safeSegment(input.importId),
    safeFileName(input.fileName),
  ].join('/');
}

export function hasAuthorR2Config(): boolean {
  return Boolean(
    env('R2_AUTHOR_ACCOUNT_ID', 'R2_ACCOUNT_ID') &&
    env('R2_AUTHOR_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID') &&
    env('R2_AUTHOR_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY') &&
    env('R2_AUTHOR_BUCKET_NAME', 'R2_AUTHOR_BUCKET', 'R2_BUCKET')
  );
}

function readAuthorR2Config(): AuthorR2Config {
  const accountId = requiredEnv('R2_AUTHOR_ACCOUNT_ID', 'R2_ACCOUNT_ID');
  const endpoint =
    env('R2_AUTHOR_ENDPOINT', 'R2_ENDPOINT') ??
    `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    accountId,
    accessKeyId: requiredEnv('R2_AUTHOR_ACCESS_KEY_ID', 'R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv('R2_AUTHOR_SECRET_ACCESS_KEY', 'R2_SECRET_ACCESS_KEY'),
    bucket: requiredEnv('R2_AUTHOR_BUCKET_NAME', 'R2_AUTHOR_BUCKET', 'R2_BUCKET'),
    region: env('R2_AUTHOR_REGION', 'R2_REGION') ?? 'auto',
    endpoint,
    owner: env('R2_AUTHOR_OWNER', 'R2_OWNER') ?? 'personal_temp',
    migrateBy: env('R2_AUTHOR_MIGRATE_BY', 'R2_MIGRATE_BY'),
  };
}

function requiredEnv(...names: string[]): string {
  const value = env(...names);
  if (!value) {
    throw new AuthorR2ConfigError(`Missing Author R2 configuration: ${names.join(' or ')}`);
  }
  return value;
}

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

function safeSegment(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'unknown';
}

function safeFileName(value: string): string {
  const name = value.split(/[\\/]/).pop() ?? 'upload.bin';
  return safeSegment(name).replace(/^\.+$/, 'upload.bin') || 'upload.bin';
}
