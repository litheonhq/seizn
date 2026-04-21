export const MEMORY_EDITOR_TYPES = ['fact', 'preference', 'experience', 'relationship', 'instruction'] as const;

export type MemoryEditorMemoryType = (typeof MEMORY_EDITOR_TYPES)[number];
export type MemoryEditorAction = 'create' | 'update' | 'unchanged';
export type MemoryEditorField =
  | 'content'
  | 'memoryType'
  | 'tags'
  | 'namespace'
  | 'importance'
  | 'npcId'
  | 'agentId'
  | 'source';

export interface MemoryEditorRow {
  id: string;
  content: string;
  memoryType: MemoryEditorMemoryType;
  tags: string[];
  namespace: string;
  importance: number;
  npcId: string | null;
  agentId: string | null;
  source: string | null;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface MemoryEditorImportRow {
  id: string | null;
  content: string;
  memoryType: MemoryEditorMemoryType;
  tags: string[];
  namespace: string;
  importance: number;
  npcId: string | null;
  agentId: string | null;
  source: string | null;
}

export interface MemoryEditorFieldDiff {
  field: MemoryEditorField;
  before: string | number | string[] | null;
  after: string | number | string[] | null;
}

export interface MemoryEditorDiffItem {
  key: string;
  action: MemoryEditorAction;
  id: string | null;
  before: MemoryEditorRow | null;
  after: MemoryEditorImportRow;
  fields: MemoryEditorFieldDiff[];
  errors: string[];
  warnings: string[];
}

export interface MemoryEditorDiffSummary {
  total: number;
  create: number;
  update: number;
  unchanged: number;
  blocked: number;
}

export interface MemoryEditorDiffResult {
  items: MemoryEditorDiffItem[];
  summary: MemoryEditorDiffSummary;
}

export const MEMORY_EDITOR_EXPORT_HEADERS = [
  'id',
  'npc_id',
  'content',
  'memory_type',
  'tags',
  'namespace',
  'importance',
  'agent_id',
  'source',
] as const;

type CsvCell = string | number | null | string[] | undefined;

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMemoryType(value: unknown): MemoryEditorMemoryType {
  return MEMORY_EDITOR_TYPES.includes(value as MemoryEditorMemoryType)
    ? (value as MemoryEditorMemoryType)
    : 'fact';
}

function normalizeImportance(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.round(parsed), 1), 10);
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))].slice(0, 50);
  }
  if (typeof value !== 'string') return [];
  return [...new Set(value.split(/[|,]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 50);
}

export function deriveNpcId(input: {
  companionMeta?: unknown;
  agentId?: unknown;
}): string | null {
  const companion =
    input.companionMeta && typeof input.companionMeta === 'object' && !Array.isArray(input.companionMeta)
      ? (input.companionMeta as Record<string, unknown>)
      : {};

  return (
    normalizeString(companion.npc_id) ||
    normalizeString(companion.npcId) ||
    normalizeString(companion.character_id) ||
    normalizeString(companion.characterId) ||
    normalizeString(input.agentId)
  );
}

export function normalizeMemoryEditorRow(row: Record<string, unknown>): MemoryEditorRow {
  return {
    id: String(row.id),
    content: String(row.content || ''),
    memoryType: normalizeMemoryType(row.memory_type),
    tags: normalizeTags(row.tags),
    namespace: normalizeString(row.namespace) || 'default',
    importance: normalizeImportance(row.importance),
    npcId: deriveNpcId({ companionMeta: row.companion_meta, agentId: row.agent_id }),
    agentId: normalizeString(row.agent_id),
    source: normalizeString(row.source),
    isEncrypted: row.is_encrypted === true,
    createdAt: String(row.created_at || ''),
    updatedAt: normalizeString(row.updated_at),
  };
}

export function normalizeImportRow(row: Record<string, unknown>): MemoryEditorImportRow {
  return {
    id: normalizeString(row.id),
    content: String(row.content || '').replace(/\x00/g, ''),
    memoryType: normalizeMemoryType(row.memory_type ?? row.memoryType),
    tags: normalizeTags(row.tags),
    namespace: normalizeString(row.namespace) || 'default',
    importance: normalizeImportance(row.importance),
    npcId: normalizeString(row.npc_id ?? row.npcId),
    agentId: normalizeString(row.agent_id ?? row.agentId),
    source: normalizeString(row.source),
  };
}

function csvEscape(value: CsvCell): string {
  const text = Array.isArray(value) ? value.join('|') : value == null ? '' : String(value);
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function memoryRowsToCsv(rows: MemoryEditorRow[]): string {
  const lines = [MEMORY_EDITOR_EXPORT_HEADERS.join(',')];
  for (const row of rows) {
    lines.push([
      row.id,
      row.npcId,
      row.content,
      row.memoryType,
      row.tags,
      row.namespace,
      row.importance,
      row.agentId,
      row.source,
    ].map(csvEscape).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

function splitCsvRows(input: string): string[] {
  const rows: string[] = [];
  let row = '';
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (char === '"' && quoted && next === '"') {
      row += '""';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      row += char;
      continue;
    }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (row.trim().length > 0) rows.push(row);
      row = '';
      if (char === '\r' && next === '\n') index += 1;
      continue;
    }
    row += char;
  }

  if (row.trim().length > 0) rows.push(row);
  return rows;
}

export function parseMemoryEditorCsv(input: string): MemoryEditorImportRow[] {
  const rows = splitCsvRows(input);
  if (rows.length === 0) return [];
  const headers = parseCsvLine(rows[0]).map((header) => header.trim());
  return rows.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const raw: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      raw[header] = cells[index] ?? '';
    });
    return normalizeImportRow(raw);
  });
}

export function parseMemoryEditorJson(input: string): MemoryEditorImportRow[] {
  const parsed = JSON.parse(input) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
      ? (parsed as { rows: unknown[] }).rows
      : [];
  return rows
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === 'object' && !Array.isArray(row))
    .map(normalizeImportRow);
}

function sameTags(a: string[], b: string[]) {
  return a.length === b.length && a.every((tag, index) => tag === b[index]);
}

function fieldDiffs(before: MemoryEditorRow, after: MemoryEditorImportRow): MemoryEditorFieldDiff[] {
  const fields: MemoryEditorFieldDiff[] = [];
  if (before.content !== after.content) fields.push({ field: 'content', before: before.content, after: after.content });
  if (before.memoryType !== after.memoryType) fields.push({ field: 'memoryType', before: before.memoryType, after: after.memoryType });
  if (!sameTags(before.tags, after.tags)) fields.push({ field: 'tags', before: before.tags, after: after.tags });
  if (before.namespace !== after.namespace) fields.push({ field: 'namespace', before: before.namespace, after: after.namespace });
  if (before.importance !== after.importance) fields.push({ field: 'importance', before: before.importance, after: after.importance });
  if (before.npcId !== after.npcId) fields.push({ field: 'npcId', before: before.npcId, after: after.npcId });
  if (before.agentId !== after.agentId) fields.push({ field: 'agentId', before: before.agentId, after: after.agentId });
  if (before.source !== after.source) fields.push({ field: 'source', before: before.source, after: after.source });
  return fields;
}

function validateImportRow(row: MemoryEditorImportRow): string[] {
  const errors: string[] = [];
  if (row.content.trim().length === 0) errors.push('content is required');
  if (row.content.length > 10000) errors.push('content exceeds 10,000 characters');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(row.namespace)) {
    errors.push('namespace must be 1-64 alphanumeric, hyphen, or underscore characters');
  }
  if (row.tags.some((tag) => tag.length > 100)) errors.push('tags must be 100 characters or less');
  return errors;
}

export function diffMemoryEditorRows(
  currentRows: MemoryEditorRow[],
  importedRows: MemoryEditorImportRow[]
): MemoryEditorDiffResult {
  const byId = new Map(currentRows.map((row) => [row.id, row]));
  const items = importedRows.map((after, index): MemoryEditorDiffItem => {
    const hasRequestedId = Boolean(after.id);
    const before = after.id ? byId.get(after.id) ?? null : null;
    const errors = validateImportRow(after);
    if (hasRequestedId && !before) errors.push('memory id was not found in the current editor scope');
    if (before?.isEncrypted) errors.push('encrypted memories cannot be edited in memory editor');
    const fields = before
      ? fieldDiffs(before, after)
      : Object.keys(after).length > 0
        ? [{ field: 'content' as const, before: null, after: after.content }]
        : [];
    const action: MemoryEditorAction = before ? (fields.length > 0 ? 'update' : 'unchanged') : hasRequestedId ? 'update' : 'create';
    return {
      key: after.id || `new-${index + 1}`,
      action,
      id: after.id,
      before,
      after,
      fields,
      errors,
      warnings: [],
    };
  });

  const summary = items.reduce<MemoryEditorDiffSummary>((acc, item) => {
    acc.total += 1;
    acc[item.action] += 1;
    if (item.errors.length > 0) acc.blocked += 1;
    return acc;
  }, { total: 0, create: 0, update: 0, unchanged: 0, blocked: 0 });

  return { items, summary };
}
