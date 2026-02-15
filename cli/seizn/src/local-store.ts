/**
 * Local (Offline-only) Memory Store for Seizn CLI
 *
 * - Stores memories in JSONL under ~/.seizn/local/memories.jsonl
 * - No network / no API key required
 *
 * Security note:
 * - If SEIZN_LOCAL_ENCRYPTION_PASSPHRASE is set, the `content` is encrypted at rest (AES-256-GCM).
 * - Content that appears to include secrets is refused by default.
 */

import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import crypto from 'node:crypto';

export interface LocalMemoryEntry {
  id: string;
  content: string;
  memoryType: string;
  tags: string[];
  namespace: string;
  source: 'local';
  createdAt: string;
  updatedAt: string;
}

type EncryptedContent = {
  alg: 'aes-256-gcm';
  salt: string; // base64
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64
};

type EncryptedLocalMemoryEntry = Omit<LocalMemoryEntry, 'content'> & {
  format: 'enc';
  v: 1;
  contentEnc: EncryptedContent;
};

export interface LocalSearchResult {
  entry: LocalMemoryEntry;
  score: number;
}

const DATA_DIR = join(homedir(), '.seizn', 'local');
const MEMORY_FILE = join(DATA_DIR, 'memories.jsonl');
const LOCAL_PASSPHRASE = process.env.SEIZN_LOCAL_ENCRYPTION_PASSPHRASE;

export function getLocalMemoryFilePath(): string {
  return MEMORY_FILE;
}

export function isLocalMemoryEncryptionEnabled(): boolean {
  return typeof LOCAL_PASSPHRASE === 'string' && LOCAL_PASSPHRASE.trim().length > 0;
}

async function ensureLocalDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

function getSensitiveContentReasons(content: string): string[] {
  const reasons = new Set<string>();
  const text = content || '';

  const patterns: Array<{ name: string; regex: RegExp }> = [
    { name: 'private key block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { name: 'OpenAI API key', regex: /\bsk-[A-Za-z0-9]{16,}\b/ },
    { name: 'Anthropic API key', regex: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/ },
    { name: 'GitHub token', regex: /\bgh[pous]_[A-Za-z0-9]{16,}\b/ },
    { name: 'Slack token', regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
    { name: 'Seizn API key', regex: /\bszn_[A-Za-z0-9]{16,}\b/ },
    { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  ];

  for (const p of patterns) {
    if (p.regex.test(text)) reasons.add(p.name);
  }

  // Env-like secrets: KEY/TOKEN/SECRET/PASSWORD assignments.
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const m = /^\s*([A-Z0-9_]{2,})\s*=\s*(.+)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1] || '';
    const value = m[2] || '';
    if (value.length < 8) continue;
    if (/(KEY|TOKEN|SECRET|PASSWORD|PRIVATE|DATABASE_URL|POSTGRES_URL|SUPABASE|JWT)/i.test(key)) {
      reasons.add(`env assignment (${key})`);
    }
  }

  return Array.from(reasons);
}

function shouldAllowSensitiveContent(): boolean {
  return process.env.SEIZN_LOCAL_ALLOW_SENSITIVE === '1';
}

function assertNoSecrets(content: string): void {
  const reasons = getSensitiveContentReasons(content);
  if (reasons.length === 0) return;
  if (shouldAllowSensitiveContent()) return;

  throw new Error(
    `Refusing to save content that appears to include secrets (${reasons.join(
      ', '
    )}). Redact it and try again.`
  );
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase, salt, 32);
}

function encryptContent(plaintext: string, passphrase: string, aad: string): EncryptedContent {
  const salt = crypto.randomBytes(16);
  const key = deriveKey(passphrase, salt);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: 'aes-256-gcm',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decryptContent(enc: EncryptedContent, passphrase: string, aad: string): string {
  if (enc.alg !== 'aes-256-gcm') {
    throw new Error(`Unsupported encryption algorithm: ${enc.alg}`);
  }

  const salt = Buffer.from(enc.salt, 'base64');
  const key = deriveKey(passphrase, salt);
  const iv = Buffer.from(enc.iv, 'base64');
  const tag = Buffer.from(enc.tag, 'base64');
  const ciphertext = Buffer.from(enc.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

export async function appendLocalMemory(input: {
  content: string;
  memoryType: string;
  tags: string[];
  namespace: string;
}): Promise<LocalMemoryEntry> {
  await ensureLocalDir();
  assertNoSecrets(input.content);

  const now = new Date().toISOString();
  const entry: LocalMemoryEntry = {
    id: crypto.randomUUID(),
    content: input.content,
    memoryType: input.memoryType,
    tags: input.tags,
    namespace: input.namespace,
    source: 'local',
    createdAt: now,
    updatedAt: now,
  };

  const passphrase = typeof LOCAL_PASSPHRASE === 'string' ? LOCAL_PASSPHRASE.trim() : '';
  const stored: LocalMemoryEntry | EncryptedLocalMemoryEntry = passphrase
    ? {
        format: 'enc',
        v: 1,
        ...entry,
        contentEnc: encryptContent(entry.content, passphrase, entry.id),
      }
    : entry;

  // Never persist plaintext if encryption is enabled.
  if ('contentEnc' in stored) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (stored as any).content;
  }

  await appendFile(MEMORY_FILE, `${JSON.stringify(stored)}\n`, { encoding: 'utf8' });
  return entry;
}

export async function readLocalMemories(): Promise<LocalMemoryEntry[]> {
  try {
    const content = await readFile(MEMORY_FILE, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const entries: LocalMemoryEntry[] = [];
    const passphrase = typeof LOCAL_PASSPHRASE === 'string' ? LOCAL_PASSPHRASE.trim() : '';
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<LocalMemoryEntry> &
          Partial<EncryptedLocalMemoryEntry>;

        if (typeof parsed?.id !== 'string') continue;
        if (typeof parsed?.memoryType !== 'string') continue;
        if (typeof parsed?.namespace !== 'string') continue;
        if (typeof parsed?.createdAt !== 'string') continue;
        if (typeof parsed?.updatedAt !== 'string') continue;

        // Plain entry
        if (typeof parsed?.content === 'string') {
          entries.push(parsed as LocalMemoryEntry);
          continue;
        }

        // Encrypted entry
        if (
          parsed?.format === 'enc' &&
          parsed?.v === 1 &&
          parsed?.contentEnc &&
          typeof (parsed.contentEnc as EncryptedContent).ciphertext === 'string'
        ) {
          const contentText = passphrase
            ? decryptContent(parsed.contentEnc as EncryptedContent, passphrase, parsed.id)
            : '[encrypted]';

          entries.push({
            id: parsed.id,
            content: contentText,
            memoryType: parsed.memoryType,
            tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
            namespace: parsed.namespace,
            source: 'local',
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
          });
        }
      } catch {
        // Skip malformed line.
      }
    }
    return entries;
  } catch {
    return [];
  }
}

export async function overwriteLocalMemories(entries: LocalMemoryEntry[]): Promise<void> {
  await ensureLocalDir();
  const passphrase = typeof LOCAL_PASSPHRASE === 'string' ? LOCAL_PASSPHRASE.trim() : '';
  const stored = entries.map((e) => {
    assertNoSecrets(e.content);
    if (!passphrase) return e;

    const enc: EncryptedLocalMemoryEntry = {
      format: 'enc',
      v: 1,
      id: e.id,
      memoryType: e.memoryType,
      tags: e.tags,
      namespace: e.namespace,
      source: 'local',
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      contentEnc: encryptContent(e.content, passphrase, e.id),
    };

    return enc;
  });

  const jsonl = stored.map((e) => JSON.stringify(e)).join('\n');
  await writeFile(MEMORY_FILE, jsonl ? `${jsonl}\n` : '', { encoding: 'utf8' });
}

export async function clearLocalMemories(): Promise<void> {
  try {
    await rm(MEMORY_FILE, { force: true });
  } catch {
    // Ignore.
  }
}

export function scoreMatch(query: string, content: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const c = content.toLowerCase();
  const terms = q.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;

  let hits = 0;
  for (const term of terms) {
    if (c.includes(term)) hits++;
  }

  // Phrase match bonus.
  if (c.includes(q)) hits += terms.length;

  const denom = terms.length * 2;
  return Math.min(1, hits / denom);
}

export function searchLocalMemories(
  entries: LocalMemoryEntry[],
  query: string,
  options: {
    limit: number;
    namespace?: string;
    memoryType?: string;
    tags?: string[];
  }
): LocalSearchResult[] {
  const limit = Math.max(1, Math.min(options.limit, 200));
  const namespace = options.namespace?.trim();
  const memoryType = options.memoryType?.trim();
  const tags = (options.tags ?? []).map((t) => t.trim()).filter(Boolean);

  const results: LocalSearchResult[] = [];

  for (const entry of entries) {
    if (namespace && entry.namespace !== namespace) continue;
    if (memoryType && entry.memoryType !== memoryType) continue;
    if (tags.length > 0 && !tags.every((t) => entry.tags.includes(t))) continue;

    const score = scoreMatch(query, entry.content);
    if (score <= 0) continue;

    results.push({ entry, score });
  }

  return results
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return (b.entry.updatedAt ?? b.entry.createdAt).localeCompare(a.entry.updatedAt ?? a.entry.createdAt);
    })
    .slice(0, limit);
}
