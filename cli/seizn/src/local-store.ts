/**
 * Local (Offline-only) Memory Store for Seizn CLI
 *
 * - Stores memories in JSONL under ~/.seizn/local/memories.jsonl
 * - No network / no API key required
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

export interface LocalSearchResult {
  entry: LocalMemoryEntry;
  score: number;
}

const DATA_DIR = join(homedir(), '.seizn', 'local');
const MEMORY_FILE = join(DATA_DIR, 'memories.jsonl');

export function getLocalMemoryFilePath(): string {
  return MEMORY_FILE;
}

async function ensureLocalDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

export async function appendLocalMemory(input: {
  content: string;
  memoryType: string;
  tags: string[];
  namespace: string;
}): Promise<LocalMemoryEntry> {
  await ensureLocalDir();

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

  await appendFile(MEMORY_FILE, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  return entry;
}

export async function readLocalMemories(): Promise<LocalMemoryEntry[]> {
  try {
    const content = await readFile(MEMORY_FILE, 'utf8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);

    const entries: LocalMemoryEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<LocalMemoryEntry>;
        if (typeof parsed?.id !== 'string' || typeof parsed?.content !== 'string') continue;
        entries.push(parsed as LocalMemoryEntry);
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
  const jsonl = entries.map((e) => JSON.stringify(e)).join('\n');
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

