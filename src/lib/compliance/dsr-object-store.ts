import crypto from 'crypto';
import { buildSignedArtifactUrl } from './dsr';

export interface DsrObjectStore {
  putJson(key: string, value: unknown): Promise<void>;
  createSignedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
}

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
}

const inMemoryObjects = new Map<string, string>();

function readR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.DSR_R2_BUCKET || process.env.R2_BUCKET || process.env.CLOUDFLARE_R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: process.env.R2_REGION || 'auto',
  };
}

function hashHex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  return hmac(serviceKey, 'aws4_request');
}

function amzDates(now = new Date()): { amzDate: string; shortDate: string } {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return { amzDate: iso, shortDate: iso.slice(0, 8) };
}

function encodePathPart(part: string): string {
  return encodeURIComponent(part).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalPath(bucket: string, key: string): string {
  return `/${encodePathPart(bucket)}/${key.split('/').map(encodePathPart).join('/')}`;
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params.entries()]
    .sort(([aKey, aValue], [bKey, bValue]) =>
      aKey === bKey ? aValue.localeCompare(bValue) : aKey.localeCompare(bKey)
    )
    .map(([key, value]) => `${encodePathPart(key)}=${encodePathPart(value)}`)
    .join('&');
}

function signCanonicalRequest(params: {
  method: 'GET' | 'PUT';
  canonicalUri: string;
  query: string;
  headers: Record<string, string>;
  signedHeaders: string;
  payloadHash: string;
  config: R2Config;
  amzDate: string;
  shortDate: string;
}): string {
  const canonicalHeaders = Object.entries(params.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key.toLowerCase()}:${value.trim()}\n`)
    .join('');
  const canonicalRequest = [
    params.method,
    params.canonicalUri,
    params.query,
    canonicalHeaders,
    params.signedHeaders,
    params.payloadHash,
  ].join('\n');
  const scope = `${params.shortDate}/${params.config.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    params.amzDate,
    scope,
    hashHex(canonicalRequest),
  ].join('\n');
  return crypto
    .createHmac('sha256', signingKey(params.config.secretAccessKey, params.shortDate, params.config.region))
    .update(stringToSign, 'utf8')
    .digest('hex');
}

export class R2DsrObjectStore implements DsrObjectStore {
  constructor(private readonly config: R2Config) {}

  private host(): string {
    return `${this.config.accountId}.r2.cloudflarestorage.com`;
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const body = JSON.stringify(value);
    const { amzDate, shortDate } = amzDates();
    const host = this.host();
    const uri = canonicalPath(this.config.bucket, key);
    const payloadHash = hashHex(body);
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const headers = {
      'content-type': 'application/json',
      host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const signature = signCanonicalRequest({
      method: 'PUT',
      canonicalUri: uri,
      query: '',
      headers,
      signedHeaders,
      payloadHash,
      config: this.config,
      amzDate,
      shortDate,
    });
    const credential = `${this.config.accessKeyId}/${shortDate}/${this.config.region}/s3/aws4_request`;
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}${uri}`, {
      method: 'PUT',
      headers: {
        ...headers,
        Authorization: authorization,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`R2 upload failed with HTTP ${response.status}`);
    }
  }

  async createSignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { amzDate, shortDate } = amzDates();
    const host = this.host();
    const uri = canonicalPath(this.config.bucket, key);
    const credential = `${this.config.accessKeyId}/${shortDate}/${this.config.region}/s3/aws4_request`;
    const query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(Math.min(Math.max(expiresInSeconds, 1), 604800)),
      'X-Amz-SignedHeaders': 'host',
    });
    const signature = signCanonicalRequest({
      method: 'GET',
      canonicalUri: uri,
      query: canonicalQuery(query),
      headers: { host },
      signedHeaders: 'host',
      payloadHash: 'UNSIGNED-PAYLOAD',
      config: this.config,
      amzDate,
      shortDate,
    });
    query.set('X-Amz-Signature', signature);
    return `https://${host}${uri}?${query.toString()}`;
  }
}

export class InMemoryDsrObjectStore implements DsrObjectStore {
  async putJson(key: string, value: unknown): Promise<void> {
    inMemoryObjects.set(key, JSON.stringify(value));
  }

  async createSignedGetUrl(key: string, expiresInSeconds: number): Promise<string> {
    const jobId = key.split('/').at(-1)?.replace(/\.json$/, '') || key;
    return buildSignedArtifactUrl({
      jobId,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      basePath: `/api/dsr/jobs/${jobId}/status`,
    });
  }

  getObject(key: string): string | undefined {
    return inMemoryObjects.get(key);
  }
}

export function getDsrObjectStore(): DsrObjectStore {
  const r2Config = readR2Config();
  if (r2Config) {
    return new R2DsrObjectStore(r2Config);
  }
  return new InMemoryDsrObjectStore();
}
