import { gunzipSync, gzipSync } from 'node:zlib';
import { createPublicKey, sign, verify, type KeyObject } from 'node:crypto';

const MAGIC = Buffer.from('SZN1', 'ascii');
const HEADER_BYTES = 12;
const SIGNATURE_BYTES = 64;
const PUBLIC_KEY_BYTES = 32;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

export interface SaveFilePayload {
  version: 'SZN1';
  exportedAt: string;
  studioId: string;
  npcId: string;
  schemaVersion: 1;
  memories: SaveFileMemory[];
  beliefs: SaveFileBelief[];
  canonLocks: SaveFileCanonLock[];
  meta: {
    memoryCount: number;
    beliefCount: number;
    canonLockCount: number;
  };
}

export interface SaveFileMemory {
  id: string;
  content: string;
  memoryType: string;
  tags: string[];
  namespace: string;
  companionMeta: Record<string, unknown>;
  scope: string;
  source: string | null;
  confidence: number;
  importance: number;
  agentId: string | null;
  entityId: string | null;
  tier: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveFileBelief {
  id: string;
  holderEntityId: string;
  aboutFactId: string;
  observedAt: string;
  witnessEventId: string | null;
  confidence: number;
  revokedAt: string | null;
  sourceType: string;
}

export interface SaveFileCanonLock {
  id: string;
  npcId: string | null;
  scope: string;
  statement: string;
  regexFastpath: string | null;
  severity: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SaveFileSigner {
  privateKey: KeyObject;
  publicKeyRaw: Buffer;
}

export function rawEd25519PublicKeyFromDer(publicKeyDer: Buffer) {
  if (publicKeyDer.length < PUBLIC_KEY_BYTES) {
    throw new Error('invalid_ed25519_public_key');
  }
  return publicKeyDer.subarray(publicKeyDer.length - PUBLIC_KEY_BYTES);
}

export function publicKeyFromRawEd25519(raw: Buffer) {
  if (raw.length !== PUBLIC_KEY_BYTES) {
    throw new Error('invalid_ed25519_public_key');
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, raw]),
    format: 'der',
    type: 'spki',
  });
}

function makeHeader(body: Buffer) {
  const header = Buffer.alloc(HEADER_BYTES);
  MAGIC.copy(header, 0);
  header.writeBigUInt64BE(BigInt(body.length), 4);
  return header;
}

function signedBytes(header: Buffer, body: Buffer) {
  return Buffer.concat([header, body]);
}

export function encodeSaveFile(payload: SaveFilePayload, signer: SaveFileSigner) {
  if (signer.publicKeyRaw.length !== PUBLIC_KEY_BYTES) {
    throw new Error('invalid_ed25519_public_key');
  }

  const body = gzipSync(Buffer.from(JSON.stringify(payload), 'utf8'));
  const header = makeHeader(body);
  const signature = sign(null, signedBytes(header, body), signer.privateKey);
  if (signature.length !== SIGNATURE_BYTES) {
    throw new Error('invalid_ed25519_signature');
  }

  return Buffer.concat([header, body, signature, signer.publicKeyRaw]);
}

export function decodeSaveFile(file: Buffer) {
  if (file.length < HEADER_BYTES + SIGNATURE_BYTES + PUBLIC_KEY_BYTES) {
    throw new Error('save_file_too_short');
  }
  if (!file.subarray(0, 4).equals(MAGIC)) {
    throw new Error('invalid_save_file_magic');
  }

  const bodyLength = Number(file.readBigUInt64BE(4));
  const bodyStart = HEADER_BYTES;
  const bodyEnd = bodyStart + bodyLength;
  const signatureEnd = bodyEnd + SIGNATURE_BYTES;
  const publicKeyEnd = signatureEnd + PUBLIC_KEY_BYTES;

  if (bodyLength < 1 || file.length !== publicKeyEnd) {
    throw new Error('invalid_save_file_length');
  }

  const header = file.subarray(0, HEADER_BYTES);
  const body = file.subarray(bodyStart, bodyEnd);
  const signature = file.subarray(bodyEnd, signatureEnd);
  const publicKeyRaw = file.subarray(signatureEnd, publicKeyEnd);
  const publicKey = publicKeyFromRawEd25519(publicKeyRaw);
  const ok = verify(null, signedBytes(header, body), publicKey, signature);
  if (!ok) {
    throw new Error('invalid_save_file_signature');
  }

  const payload = JSON.parse(gunzipSync(body).toString('utf8')) as SaveFilePayload;
  if (payload.version !== 'SZN1' || payload.schemaVersion !== 1) {
    throw new Error('unsupported_save_file_version');
  }

  return { payload, publicKeyRaw };
}
