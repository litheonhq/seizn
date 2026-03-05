import crypto from 'crypto';
import { lookup } from 'node:dns/promises';
import net from 'node:net';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MemoryImageRelation = 'attachment' | 'source' | 'reference' | 'derived';

export interface MemoryImageAttachmentInput {
  image_url?: string;
  image_base64?: string;
  image_mime_type?: string;
  image_filename?: string;
  image_relation?: MemoryImageRelation;
}

export interface MemoryImageAttachmentRecord {
  link_id: string;
  asset_id: string;
  relation: MemoryImageRelation;
  storage_provider: string;
  storage_key: string;
  filename: string | null;
  mime_type: string;
  size_bytes: number | null;
  sha256_hash: string;
  created_at: string;
  signed_url: string | null;
}

interface PreparedImage {
  bytes: Uint8Array;
  sha256: string;
  mimeType: string;
  fileName: string | null;
  sourceUrl: string | null;
}

interface StoredAssetRow {
  id: string;
  user_id: string;
  storage_provider: string;
  storage_key: string;
  filename: string | null;
  mime_type: string;
  size_bytes: number | null;
  sha256_hash: string;
  created_at: string;
}

interface LinkRow {
  id: string;
  memory_id: string;
  asset_id: string;
  relation: MemoryImageRelation;
  created_at: string;
}

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const RELATIONS = new Set<MemoryImageRelation>(['attachment', 'source', 'reference', 'derived']);

const MAX_IMAGE_BYTES = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_MAX_BYTES || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 5 * 1024 * 1024;
})();

const FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_FETCH_TIMEOUT_MS || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 10000;
})();

const MAX_IMAGE_REDIRECTS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_MAX_REDIRECTS || '', 10);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return 3;
})();

const SIGNED_URL_TTL_SECONDS = (() => {
  const raw = Number.parseInt(process.env.MEMORY_IMAGE_SIGNED_URL_TTL_SECONDS || '', 10);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 3600;
})();

const BLOCKED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254']);
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

function getBucketName(): string {
  return process.env.MEMORY_ASSET_BUCKET || 'memory-assets';
}

function normalizeMimeType(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.split(';')[0].trim().toLowerCase();
}

function stripUrlQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

function verifyImageMagicBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return true;
  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return true;
  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  return false;
}

function toNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function inferFileName(inputName: string | undefined, mimeType: string): string | null {
  if (inputName && inputName.length <= 255) return inputName;
  return `memory-image.${extFromMimeType(mimeType)}`;
}

function isAlreadyExistsError(error: { message?: string | null } | null | undefined): boolean {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('already exists') || msg.includes('duplicate') || msg.includes('the resource already exists');
}

function isMissingTableError(error: { message?: string | null; code?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === '42P01') return true;
  const message = (error.message || '').toLowerCase();
  return (
    (message.includes('relation') && message.includes('does not exist')) ||
    (message.includes('table') && message.includes('schema cache'))
  );
}

function isNotFoundStorageError(error: { message?: string | null } | null | undefined): boolean {
  const msg = (error?.message || '').toLowerCase();
  return msg.includes('not found') || msg.includes('does not exist') || msg.includes('no such key');
}

function normalizeRelation(value: string | undefined): MemoryImageRelation {
  if (!value) return 'attachment';
  return RELATIONS.has(value as MemoryImageRelation) ? (value as MemoryImageRelation) : 'attachment';
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((v) => Number.parseInt(v, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return true;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // RFC6598 CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function normalizeIpCandidate(address: string): string {
  const lowered = address.trim().toLowerCase();
  const zoneIndex = lowered.indexOf('%');
  return zoneIndex >= 0 ? lowered.slice(0, zoneIndex) : lowered;
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = normalizeIpCandidate(address);
  const version = net.isIP(normalized);
  if (!version) return true;

  if (version === 4) {
    return isBlockedIpv4(normalized);
  }

  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
  if (normalized.startsWith('fe80:')) return true; // link local
  if (normalized.startsWith('ff')) return true; // multicast
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (net.isIP(mapped) === 4) {
      return isBlockedIpv4(mapped);
    }
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTNAMES.has(hostname)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function normalizeAddressSet(addresses: string[]): string[] {
  return Array.from(new Set(addresses.map(normalizeIpCandidate))).sort();
}

function isSameAddressSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function validateRemoteImageUrl(
  urlString: string,
  resolutionPinning?: Map<string, string[]>
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error('image_url must be a valid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('image_url must use https');
  }
  if (parsed.username || parsed.password) {
    throw new Error('image_url must not include credentials');
  }

  const hostname = parsed.hostname.trim().toLowerCase();
  if (!hostname || isBlockedHostname(hostname)) {
    throw new Error('image_url hostname is not allowed');
  }

  if (net.isIP(hostname) && isBlockedIpAddress(hostname)) {
    throw new Error('image_url resolves to a private or internal IP');
  }

  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses || addresses.length === 0) {
      throw new Error('image_url hostname could not be resolved');
    }
    const normalized = normalizeAddressSet(addresses.map((record) => record.address));
    for (const record of addresses) {
      if (isBlockedIpAddress(record.address)) {
        throw new Error('image_url resolves to a private or internal IP');
      }
    }
    if (resolutionPinning) {
      const pinned = resolutionPinning.get(hostname);
      if (!pinned) {
        resolutionPinning.set(hostname, normalized);
      } else if (!isSameAddressSet(pinned, normalized)) {
        throw new Error('image_url hostname resolution changed during fetch');
      }
    }
  } catch (error) {
    if (error instanceof Error && /(private or internal ip|resolution changed)/i.test(error.message)) {
      throw error;
    }
    throw new Error('image_url hostname could not be resolved');
  }

  return parsed;
}

function splitStorageKey(storageKey: string): { bucket: string; path: string } | null {
  const splitAt = storageKey.indexOf('/');
  if (splitAt <= 0 || splitAt >= storageKey.length - 1) {
    return null;
  }
  return {
    bucket: storageKey.slice(0, splitAt),
    path: storageKey.slice(splitAt + 1),
  };
}

function isAttachmentStorageKey(storageKey: string): boolean {
  const bucket = getBucketName();
  return storageKey.startsWith(`${bucket}/`) && splitStorageKey(storageKey) !== null;
}

async function removeStorageObject(
  supabase: SupabaseClient,
  storageKey: string | null | undefined
): Promise<void> {
  if (!storageKey) return;
  const split = splitStorageKey(storageKey);
  if (!split) return;

  const { error } = await supabase.storage.from(split.bucket).remove([split.path]);
  if (error && !isNotFoundStorageError(error)) {
    console.warn('[memory/image] Failed to remove storage object during cleanup:', error.message);
  }
}

async function cleanupOrphanAsset(params: {
  supabase: SupabaseClient;
  assetId: string;
  storageKey: string;
}): Promise<void> {
  const [, deleteResult] = await Promise.all([
    removeStorageObject(params.supabase, params.storageKey),
    params.supabase
      .from('spring_assets')
      .delete()
      .eq('id', params.assetId),
  ]);

  if (deleteResult.error) {
    console.warn('[memory/image] Failed to delete orphan spring_assets row:', deleteResult.error.message);
  }
}

async function readResponseBodyLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxBytes) {
      throw new Error(`Image too large (max ${maxBytes} bytes)`);
    }
    return bytes;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value || value.length === 0) continue;

    total += value.length;
    if (total > maxBytes) {
      await reader.cancel('Image too large');
      throw new Error(`Image too large (max ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export function hasMemoryImagePayload(input: MemoryImageAttachmentInput): boolean {
  return Boolean(toNonEmptyString(input.image_url) || toNonEmptyString(input.image_base64));
}

export function validateMemoryImagePayload(input: MemoryImageAttachmentInput): string | null {
  const imageUrl = toNonEmptyString(input.image_url);
  const imageBase64 = toNonEmptyString(input.image_base64);
  const imageMimeType = normalizeMimeType(input.image_mime_type);
  const imageFilename = toNonEmptyString(input.image_filename);
  const imageRelation = toNonEmptyString(input.image_relation);

  if (!imageUrl && !imageBase64) {
    return null;
  }

  if (imageUrl && imageBase64) {
    return 'Provide only one of image_url or image_base64';
  }

  if (imageUrl) {
    let parsed: URL;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return 'image_url must be a valid URL';
    }
    if (parsed.protocol !== 'https:') {
      return 'image_url must use https';
    }
    if (imageUrl.length > 2048) {
      return 'image_url too long (max 2048 chars)';
    }
    if (parsed.username || parsed.password) {
      return 'image_url must not include credentials';
    }
  }

  if (imageBase64 && !imageMimeType) {
    return 'image_mime_type is required when using image_base64';
  }

  if (imageMimeType && !ALLOWED_IMAGE_MIME_TYPES.has(imageMimeType)) {
    return `image_mime_type must be one of: ${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}`;
  }

  if (imageFilename && imageFilename.length > 255) {
    return 'image_filename too long (max 255 chars)';
  }

  if (imageRelation && !RELATIONS.has(imageRelation as MemoryImageRelation)) {
    return `image_relation must be one of: ${Array.from(RELATIONS).join(', ')}`;
  }

  return null;
}

async function prepareImagePayload(input: MemoryImageAttachmentInput): Promise<PreparedImage> {
  const imageUrl = toNonEmptyString(input.image_url);
  let imageBase64 = toNonEmptyString(input.image_base64);
  let mimeType = normalizeMimeType(input.image_mime_type);
  const requestedFileName = toNonEmptyString(input.image_filename);

  if (!imageUrl && !imageBase64) {
    throw new Error('No image payload provided');
  }

  let bytes: Uint8Array;
  let sourceUrl: string | null = null;

  if (imageBase64) {
    const dataUrlMatch = imageBase64.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      mimeType = normalizeMimeType(mimeType || dataUrlMatch[1]);
      imageBase64 = dataUrlMatch[2];
    }

    const compact = imageBase64.replace(/\s/g, '');
    const estimatedBytes = Math.floor((compact.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (max ${MAX_IMAGE_BYTES} bytes)`);
    }

    bytes = Uint8Array.from(Buffer.from(compact, 'base64'));
  } else {
    const resolutionPinning = new Map<string, string[]>();
    const validated = await validateRemoteImageUrl(imageUrl!, resolutionPinning);
    let requestUrl = validated.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response | null = null;
    try {
      for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount += 1) {
        await validateRemoteImageUrl(requestUrl, resolutionPinning);
        response = await fetch(requestUrl, {
          signal: controller.signal,
          redirect: 'manual',
        });
        await validateRemoteImageUrl(requestUrl, resolutionPinning);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new Error('image_url redirect is missing location');
          }
          if (redirectCount >= MAX_IMAGE_REDIRECTS) {
            throw new Error('Too many redirects while fetching image_url');
          }
          const redirected = new URL(location, requestUrl).toString();
          const validatedRedirect = await validateRemoteImageUrl(redirected, resolutionPinning);
          requestUrl = validatedRedirect.toString();
          continue;
        }

        break;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Timed out while fetching image_url');
      }
      if (error instanceof Error && error.message) {
        throw error;
      }
      throw new Error('Failed to fetch image_url');
    } finally {
      clearTimeout(timeout);
    }

    if (!response) {
      throw new Error('Failed to fetch image_url');
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch image_url (${response.status})`);
    }

    sourceUrl = requestUrl;
    const headerMime = normalizeMimeType(response.headers.get('content-type'));
    if (headerMime && !headerMime.startsWith('image/')) {
      throw new Error('image_url must point to an image resource');
    }
    mimeType = normalizeMimeType(mimeType || headerMime);

    const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error(`Image too large (max ${MAX_IMAGE_BYTES} bytes)`);
    }

    bytes = await readResponseBodyLimited(response, MAX_IMAGE_BYTES);
  }

  if (!bytes || bytes.length === 0) {
    throw new Error('Decoded image is empty');
  }

  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image too large (max ${MAX_IMAGE_BYTES} bytes)`);
  }

  if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image mime type. Allowed: ${Array.from(ALLOWED_IMAGE_MIME_TYPES).join(', ')}`);
  }
  if (!verifyImageMagicBytes(bytes)) {
    throw new Error('Image binary does not match any known image signature');
  }

  const fileName = inferFileName(requestedFileName, mimeType);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');

  return {
    bytes,
    sha256,
    mimeType,
    fileName,
    sourceUrl,
  };
}

async function uploadToBucket(
  supabase: SupabaseClient,
  userId: string,
  memoryId: string,
  image: PreparedImage
): Promise<string> {
  const bucket = getBucketName();
  const ext = extFromMimeType(image.mimeType);
  const storagePath = `memories/${userId}/${memoryId}/${image.sha256}.${ext}`;

  let { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, image.bytes, {
    contentType: image.mimeType,
    upsert: false,
  });

  if (uploadError && (uploadError.message || '').toLowerCase().includes('bucket')) {
    const { error: createError } = await supabase.storage.createBucket(bucket, { public: false });
    if (createError && !isAlreadyExistsError(createError)) {
      throw new Error(`Unable to create storage bucket: ${createError.message}`);
    }

    const retry = await supabase.storage.from(bucket).upload(storagePath, image.bytes, {
      contentType: image.mimeType,
      upsert: false,
    });
    uploadError = retry.error;
  }

  if (uploadError && !isAlreadyExistsError(uploadError)) {
    throw new Error(`Failed to upload image: ${uploadError.message}`);
  }

  return `${bucket}/${storagePath}`;
}

async function findAssetByHash(
  supabase: SupabaseClient,
  userId: string,
  sha256: string
): Promise<StoredAssetRow | null> {
  const { data, error } = await supabase
    .from('spring_assets')
    .select('id, user_id, storage_provider, storage_key, filename, mime_type, size_bytes, sha256_hash, created_at')
    .eq('user_id', userId)
    .eq('sha256_hash', sha256)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to query existing asset: ${error.message}`);
  }

  return (data as StoredAssetRow | null) || null;
}

async function createAsset(
  supabase: SupabaseClient,
  userId: string,
  storageKey: string,
  image: PreparedImage
): Promise<StoredAssetRow> {
  const { data, error } = await supabase
    .from('spring_assets')
    .insert({
      user_id: userId,
      storage_provider: 'r2',
      storage_key: storageKey,
      filename: image.fileName,
      mime_type: image.mimeType,
      size_bytes: image.bytes.length,
      sha256_hash: image.sha256,
      status: 'processed',
      extracted_metadata: {
        source: 'v1-memory-image',
        original_url: image.sourceUrl ? stripUrlQuery(image.sourceUrl) : null,
      },
    })
    .select('id, user_id, storage_provider, storage_key, filename, mime_type, size_bytes, sha256_hash, created_at')
    .single();

  if (error || !data) {
    throw new Error(`Failed to create asset record: ${error?.message || 'unknown error'}`);
  }

  return data as StoredAssetRow;
}

async function ensureLink(
  supabase: SupabaseClient,
  memoryId: string,
  assetId: string,
  relation: MemoryImageRelation
): Promise<LinkRow> {
  const { data, error } = await supabase
    .from('memory_asset_links')
    .insert({
      memory_id: memoryId,
      asset_id: assetId,
      relation,
    })
    .select('id, memory_id, asset_id, relation, created_at')
    .single();

  if (!error && data) {
    return data as LinkRow;
  }

  if (error && error.code !== '23505') {
    if (isMissingTableError(error)) {
      throw new Error('memory_asset_links table is missing. Apply latest migrations first.');
    }
    throw new Error(`Failed to link image asset: ${error.message}`);
  }

  const existing = await supabase
    .from('memory_asset_links')
    .select('id, memory_id, asset_id, relation, created_at')
    .eq('memory_id', memoryId)
    .eq('asset_id', assetId)
    .eq('relation', relation)
    .maybeSingle();

  if (existing.error || !existing.data) {
    throw new Error(`Failed to load existing image link: ${existing.error?.message || 'not found'}`);
  }

  return existing.data as LinkRow;
}

async function createSignedUrl(
  supabase: SupabaseClient,
  storageKey: string
): Promise<string | null> {
  const split = splitStorageKey(storageKey);
  if (!split) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(split.bucket)
    .createSignedUrl(split.path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

function formatAttachment(
  link: LinkRow,
  asset: StoredAssetRow,
  signedUrl: string | null
): MemoryImageAttachmentRecord {
  return {
    link_id: link.id,
    asset_id: asset.id,
    relation: link.relation,
    storage_provider: asset.storage_provider,
    storage_key: asset.storage_key,
    filename: asset.filename || null,
    mime_type: asset.mime_type,
    size_bytes: asset.size_bytes,
    sha256_hash: asset.sha256_hash,
    created_at: link.created_at,
    signed_url: signedUrl,
  };
}

export async function attachImageToMemory(params: {
  supabase: SupabaseClient;
  userId: string;
  memoryId: string;
  input: MemoryImageAttachmentInput;
}): Promise<MemoryImageAttachmentRecord> {
  const validationError = validateMemoryImagePayload(params.input);
  if (validationError) {
    throw new Error(validationError);
  }

  if (!hasMemoryImagePayload(params.input)) {
    throw new Error('No image payload provided');
  }

  const prepared = await prepareImagePayload(params.input);
  const relation = normalizeRelation(toNonEmptyString(params.input.image_relation));

  let asset = await findAssetByHash(params.supabase, params.userId, prepared.sha256);
  if (asset && !isAttachmentStorageKey(asset.storage_key)) {
    asset = null;
  }
  let createdAsset: StoredAssetRow | null = null;
  if (!asset) {
    const storageKey = await uploadToBucket(params.supabase, params.userId, params.memoryId, prepared);
    try {
      asset = await createAsset(params.supabase, params.userId, storageKey, prepared);
      createdAsset = asset;
    } catch (error) {
      await removeStorageObject(params.supabase, storageKey);
      throw error;
    }
  }

  let link: LinkRow;
  try {
    link = await ensureLink(params.supabase, params.memoryId, asset.id, relation);
  } catch (error) {
    if (createdAsset) {
      await cleanupOrphanAsset({
        supabase: params.supabase,
        assetId: createdAsset.id,
        storageKey: createdAsset.storage_key,
      });
    }
    throw error;
  }
  const signedUrl = await createSignedUrl(params.supabase, asset.storage_key);

  return formatAttachment(link, asset, signedUrl);
}

export async function listMemoryImageAttachments(params: {
  supabase: SupabaseClient;
  userId: string;
  memoryId: string;
}): Promise<MemoryImageAttachmentRecord[]> {
  const linksResult = await params.supabase
    .from('memory_asset_links')
    .select('id, memory_id, asset_id, relation, created_at')
    .eq('memory_id', params.memoryId)
    .order('created_at', { ascending: true });

  if (linksResult.error) {
    if (isMissingTableError(linksResult.error)) {
      return [];
    }
    throw new Error(`Failed to load memory image links: ${linksResult.error.message}`);
  }

  const links = (linksResult.data as LinkRow[] | null) || [];
  if (links.length === 0) return [];

  const assetIds = Array.from(new Set(links.map((l) => l.asset_id)));
  const assetsResult = await params.supabase
    .from('spring_assets')
    .select('id, user_id, storage_provider, storage_key, filename, mime_type, size_bytes, sha256_hash, created_at')
    .in('id', assetIds)
    .eq('user_id', params.userId);

  if (assetsResult.error) {
    throw new Error(`Failed to load image assets: ${assetsResult.error.message}`);
  }

  const assets = (assetsResult.data as StoredAssetRow[] | null) || [];
  const byId = new Map(assets.map((asset) => [asset.id, asset]));

  const resolved = await Promise.all(
    links.map(async (link) => {
      const asset = byId.get(link.asset_id);
      if (!asset) return null;
      const signedUrl = await createSignedUrl(params.supabase, asset.storage_key);
      return formatAttachment(link, asset, signedUrl);
    })
  );

  return resolved.filter((item): item is MemoryImageAttachmentRecord => item !== null);
}
