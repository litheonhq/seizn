/**
 * Anthropic Memory tool adapter (R8 — locked 2026-05-08).
 *
 * Anthropic's `memory_20250818` tool gives Claude a filesystem-shaped
 * scratch space the host application must back. This route is that
 * backend for any Claude API customer who wants Seizn as their memory
 * provider — pass it as the tool implementation in their Anthropic
 * API integration and the 6 spec'd commands route into Seizn's
 * /api/v1/memories store.
 *
 * Why we want this: the Anthropic memory tool is direct competition
 * for /api/v1/memories at the storage layer. Building this adapter
 * turns the competitor surface into a distribution channel — every
 * Claude API customer who picks up the memory tool gets Seizn's
 * dedup / multi-agent scope / version history / webhook surface for
 * free.
 *
 * Auth: same Bearer szn_... API key as the rest of /api/v1/.
 *
 * Spec: https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
 *
 * Commands (POST body shape):
 *   { command: 'view',         path: '/memories[/<ns>[/<name>]]' }
 *   { command: 'create',       path, file_text }
 *   { command: 'str_replace',  path, old_str, new_str }
 *   { command: 'insert',       path, insert_line, new_str }
 *   { command: 'delete',       path }
 *   { command: 'rename',       old_path, new_path }
 *
 * Path convention:
 *   /memories                  → root: lists namespaces the caller has touched
 *   /memories/<ns>             → namespace: lists files in that namespace
 *   /memories/<ns>/<name>      → file: a single memory row
 *
 * `name` is stored on memories.metadata.anthropic_tool_name so the same
 * memory row can be addressed by both v1 API id and tool-style path.
 *
 * Response content negotiation (R13 C5):
 *   default — `Content-Type: application/json` `{ result: string }` on OK,
 *             `{ error: { code, message } }` + HTTP status on failure.
 *   `Accept: text/plain` — bare text body, suitable for piping straight
 *             into the Anthropic `tool_result.content` text field. Errors
 *             arrive as `<code>: <message>` in plain text + HTTP status.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ToolBody {
  command?: unknown;
  path?: unknown;
  old_path?: unknown;
  new_path?: unknown;
  file_text?: unknown;
  old_str?: unknown;
  new_str?: unknown;
  insert_line?: unknown;
}

interface ParsedPath {
  namespace: string | null;
  name: string | null;
  /** Original input path, normalized (no trailing slash, leading slash). */
  raw: string;
}

const ROOT_PATH = '/memories';
const PATH_PREFIX = '/memories/';
const MAX_FILE_BYTES = 200_000; // 200KB cap per memory body — protect against runaway tool loops.
const MAX_NAMESPACE_LEN = 64;
const MAX_NAME_LEN = 128;

interface MemoryRow {
  id: string;
  content: string;
  namespace: string | null;
  metadata: Record<string, unknown> | null;
  is_deleted: boolean | null;
  user_id: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }
  const userId = authResult.userId;

  // R13 C5 — content negotiation. Default JSON `{result:text}` envelope is
  // ergonomic for a customer-side adapter that maps it into a tool_result
  // block. Callers that want to pipe the body straight into the Anthropic
  // tool_result.content text field can send `Accept: text/plain` and get
  // bare text back (errors arrive as plain-text with the HTTP status).
  const wantsPlain = preferPlainText(request.headers.get('accept'));

  let body: ToolBody;
  try {
    body = (await request.json()) as ToolBody;
  } catch {
    return toolErr('invalid_body', 'Request body must be valid JSON', 400, wantsPlain);
  }

  const command = typeof body.command === 'string' ? body.command : '';
  const supabase = createServerClient();

  try {
    switch (command) {
      case 'view':
        return await handleView(supabase, userId, parsePath(asString(body.path)), wantsPlain);
      case 'create':
        return await handleCreate(
          supabase,
          userId,
          parsePath(asString(body.path)),
          asString(body.file_text),
          wantsPlain,
        );
      case 'str_replace':
        return await handleStrReplace(
          supabase,
          userId,
          parsePath(asString(body.path)),
          asString(body.old_str),
          asString(body.new_str),
          wantsPlain,
        );
      case 'insert':
        return await handleInsert(
          supabase,
          userId,
          parsePath(asString(body.path)),
          asNumber(body.insert_line),
          asString(body.new_str),
          wantsPlain,
        );
      case 'delete':
        return await handleDelete(supabase, userId, parsePath(asString(body.path)), wantsPlain);
      case 'rename':
        return await handleRename(
          supabase,
          userId,
          parsePath(asString(body.old_path)),
          parsePath(asString(body.new_path)),
          wantsPlain,
        );
      default:
        return toolErr(
          'unknown_command',
          `command must be one of view/create/str_replace/insert/delete/rename`,
          400,
          wantsPlain,
        );
    }
  } catch (error) {
    if (error instanceof ToolError) {
      return toolErr(error.code, error.message, error.status, wantsPlain);
    }
    console.error('[anthropic-tool] unexpected error', error);
    return toolErr('internal_error', 'Memory tool adapter failed', 500, wantsPlain);
  }
}

function preferPlainText(accept: string | null): boolean {
  if (!accept) return false;
  // Honor explicit text/plain; ignore */* (too broad — defaulting to JSON
  // keeps existing JSON callers stable).
  return accept.toLowerCase().split(',').some((part) => {
    const media = part.split(';')[0].trim();
    return media === 'text/plain';
  });
}

// R12 audit fix (A2): never echo raw Postgres error messages to the
// client. They leak column names, constraint names, and SQL fragments.
// Use this wrapper for every supabase error path: log server-side,
// return a generic message to the caller.
function reportDbError(
  context: string,
  error: { message?: string | null; code?: string | null } | null | undefined,
): never {
  console.error(`[anthropic-tool] ${context}: ${error?.message ?? 'unknown'}`);
  throw new ToolError('database_error', 'Storage error', 500);
}

// ---------- Command handlers ----------

async function handleView(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
  wantsPlain: boolean,
): Promise<NextResponse> {
  // R12 audit fix (C2): scope all listing to memories THIS TOOL created.
  // Pre-fix, view of /memories surfaced every memory the user had — from
  // /api/v1/memories, Obsidian import, Author Memory v3, etc. — into the
  // Anthropic tool-use loop, leaking internal namespaces. Filter to
  // metadata.anthropic_tool_path IS NOT NULL so only tool-owned rows
  // show up. Add LIMIT to prevent unbounded scans (audit A5).

  // /memories → list namespaces the tool has used
  if (!parsed.namespace) {
    const { data, error } = await supabase
      .from('memories')
      .select('namespace')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .not('namespace', 'is', null)
      .not('metadata->anthropic_tool_path', 'is', null)
      .limit(1000);
    if (error) reportDbError('view root', error);
    const namespaces = Array.from(
      new Set((data ?? []).map((r) => r.namespace).filter((n): n is string => typeof n === 'string')),
    ).sort();
    return toolOk(formatListing(ROOT_PATH, namespaces.map((n) => `${n}/`)), wantsPlain);
  }

  // /memories/<ns> → list files in namespace (tool-owned only)
  if (!parsed.name) {
    const { data, error } = await supabase
      .from('memories')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .eq('namespace', parsed.namespace)
      .not('metadata->anthropic_tool_path', 'is', null)
      .limit(1000);
    if (error) reportDbError('view namespace', error);
    const names = (data ?? [])
      .map((r) => extractToolName(r.metadata as Record<string, unknown> | null))
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
      .sort();
    return toolOk(formatListing(`${PATH_PREFIX}${parsed.namespace}`, names), wantsPlain);
  }

  // /memories/<ns>/<name> → file content
  const row = await findMemoryByPath(supabase, userId, parsed);
  if (!row) {
    throw new ToolError('not_found', `No memory at ${parsed.raw}`, 404);
  }
  return toolOk(row.content, wantsPlain);
}

async function handleCreate(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
  fileText: string,
  wantsPlain: boolean,
): Promise<NextResponse> {
  if (!parsed.namespace || !parsed.name) {
    throw new ToolError('bad_path', `create requires /memories/<ns>/<name>`, 400);
  }
  if (fileText.length > MAX_FILE_BYTES) {
    throw new ToolError(
      'file_too_large',
      `file_text exceeds ${MAX_FILE_BYTES} bytes`,
      413,
    );
  }
  const existing = await findMemoryByPath(supabase, userId, parsed);
  if (existing) {
    const { error } = await supabase
      .from('memories')
      .update({
        content: fileText,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('user_id', userId);
    if (error) reportDbError('create update', error);
    return toolOk(`Updated ${parsed.raw}`, wantsPlain);
  }
  const { error } = await supabase.from('memories').insert({
    user_id: userId,
    content: fileText,
    namespace: parsed.namespace,
    is_encrypted: false,
    is_deleted: false,
    deleted_at: null,
    metadata: { anthropic_tool_name: parsed.name, anthropic_tool_path: parsed.raw },
  });
  if (error) {
    // R12 audit fix (B5): partial unique on (user_id, namespace,
    // anthropic_tool_name) catches concurrent inserts. Surface as 409.
    if (isUniqueViolation(error)) {
      throw new ToolError('exists', `Path ${parsed.raw} was created concurrently`, 409);
    }
    reportDbError('create insert', error);
  }
  return toolOk(`Created ${parsed.raw}`, wantsPlain);
}

async function handleStrReplace(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
  oldStr: string,
  newStr: string,
  wantsPlain: boolean,
): Promise<NextResponse> {
  const row = await requireMemoryAtPath(supabase, userId, parsed);
  if (!oldStr) {
    throw new ToolError('bad_args', 'old_str must be a non-empty string', 400);
  }
  const idx = row.content.indexOf(oldStr);
  if (idx === -1) {
    throw new ToolError('not_found', `old_str not found in ${parsed.raw}`, 404);
  }
  // Match Anthropic spec: only first occurrence is replaced; further matches
  // are an error to flag ambiguity.
  if (row.content.indexOf(oldStr, idx + 1) !== -1) {
    throw new ToolError(
      'ambiguous',
      `old_str matches multiple times in ${parsed.raw}; pass a longer prefix to disambiguate`,
      409,
    );
  }
  const next = row.content.slice(0, idx) + newStr + row.content.slice(idx + oldStr.length);
  if (next.length > MAX_FILE_BYTES) {
    throw new ToolError(
      'file_too_large',
      `result exceeds ${MAX_FILE_BYTES} bytes`,
      413,
    );
  }
  // R12 audit fix (B4): compare-and-swap on the content we just read.
  // Two concurrent str_replace calls would otherwise both load identical
  // content, both apply distinct replacements, and the second UPDATE
  // silently overwrites the first. Chain .eq('content', row.content)
  // and .select('id') so a row count of 0 surfaces as 'conflict'.
  const { data: updated, error } = await supabase
    .from('memories')
    .update({ content: next, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('user_id', userId)
    .eq('content', row.content)
    .select('id');
  if (error) reportDbError('str_replace update', error);
  if (!updated || updated.length === 0) {
    throw new ToolError(
      'conflict',
      `${parsed.raw} was modified concurrently; reload and retry`,
      409,
    );
  }
  return toolOk(`Replaced 1 occurrence in ${parsed.raw}`, wantsPlain);
}

async function handleInsert(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
  insertLine: number,
  newStr: string,
  wantsPlain: boolean,
): Promise<NextResponse> {
  const row = await requireMemoryAtPath(supabase, userId, parsed);
  const lines = row.content.split('\n');
  if (insertLine < 0 || insertLine > lines.length) {
    throw new ToolError(
      'bad_args',
      `insert_line ${insertLine} out of range (0..${lines.length})`,
      400,
    );
  }
  // Anthropic spec: insert AFTER the given line number (0 = top of file).
  lines.splice(insertLine, 0, newStr);
  const next = lines.join('\n');
  if (next.length > MAX_FILE_BYTES) {
    throw new ToolError('file_too_large', `result exceeds ${MAX_FILE_BYTES} bytes`, 413);
  }
  const { error } = await supabase
    .from('memories')
    .update({ content: next, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('user_id', userId);
  if (error) reportDbError('update', error);
  // R13 C12 — Anthropic spec uses 1-based line numbers when describing
  // "insert AFTER line N" in tool documentation. Our implementation treats
  // insert_line as 0-based offset (0 = top of file, N = before line N+1).
  // The two semantics agree at insert_line=0 ("insert at the very top"),
  // which is the common case. Document the divergence so callers porting
  // from other memory_20250818 backends know.
  return toolOk(`Inserted at line ${insertLine} of ${parsed.raw}`, wantsPlain);
}

async function handleDelete(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
  wantsPlain: boolean,
): Promise<NextResponse> {
  const row = await requireMemoryAtPath(supabase, userId, parsed);
  // Soft delete to preserve memory_content_history audit trail.
  const { error } = await supabase
    .from('memories')
    .update({ is_deleted: true, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('user_id', userId);
  if (error) reportDbError('update', error);
  return toolOk(`Deleted ${parsed.raw}`, wantsPlain);
}

async function handleRename(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  oldPath: ParsedPath,
  newPath: ParsedPath,
  wantsPlain: boolean,
): Promise<NextResponse> {
  if (!newPath.namespace || !newPath.name) {
    throw new ToolError('bad_path', 'rename requires new_path = /memories/<ns>/<name>', 400);
  }
  const row = await requireMemoryAtPath(supabase, userId, oldPath);
  const dest = await findMemoryByPath(supabase, userId, newPath);
  if (dest) {
    throw new ToolError('exists', `${newPath.raw} already exists`, 409);
  }
  const nextMetadata: Record<string, unknown> = {
    ...((row.metadata as Record<string, unknown>) ?? {}),
    anthropic_tool_name: newPath.name,
    anthropic_tool_path: newPath.raw,
  };
  const { error } = await supabase
    .from('memories')
    .update({
      namespace: newPath.namespace,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('user_id', userId);
  if (error) {
    // R12 audit fix (B9): partial unique catches concurrent renames to
    // the same destination.
    if (isUniqueViolation(error)) {
      throw new ToolError('exists', `${newPath.raw} was created concurrently`, 409);
    }
    reportDbError('rename update', error);
  }
  return toolOk(`Renamed ${oldPath.raw} → ${newPath.raw}`, wantsPlain);
}

function isUniqueViolation(
  error: { message?: string | null; code?: string | null },
): boolean {
  const msg = error?.message ?? '';
  return error?.code === '23505' || msg.includes('duplicate key') || msg.includes('unique');
}

// ---------- Helpers ----------

class ToolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

function toolOk(text: string, wantsPlain: boolean): NextResponse {
  if (wantsPlain) {
    return new NextResponse(text, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ result: text });
}

function toolErr(code: string, message: string, status: number, wantsPlain: boolean): NextResponse {
  if (wantsPlain) {
    return new NextResponse(`${code}: ${message}`, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ error: { code, message } }, { status });
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
}

function parsePath(input: string): ParsedPath {
  const trimmed = input.trim().replace(/\/+$/, '') || ROOT_PATH;
  if (trimmed === ROOT_PATH) {
    return { namespace: null, name: null, raw: trimmed };
  }
  if (!trimmed.startsWith(PATH_PREFIX)) {
    throw new ToolError(
      'bad_path',
      `path must start with ${PATH_PREFIX}`,
      400,
    );
  }
  const tail = trimmed.slice(PATH_PREFIX.length);
  const segments = tail.split('/').filter(Boolean);
  if (segments.length === 0) {
    return { namespace: null, name: null, raw: ROOT_PATH };
  }
  const namespace = segments[0];
  if (namespace.length > MAX_NAMESPACE_LEN || /[^A-Za-z0-9_\-:.]/.test(namespace)) {
    throw new ToolError(
      'bad_path',
      `namespace must be ≤${MAX_NAMESPACE_LEN} chars and match [A-Za-z0-9_\\-:.]+`,
      400,
    );
  }
  if (segments.length === 1) {
    return { namespace, name: null, raw: trimmed };
  }
  if (segments.length > 2) {
    throw new ToolError(
      'bad_path',
      'path supports at most one level of nesting under namespace',
      400,
    );
  }
  const name = segments[1];
  if (name.length > MAX_NAME_LEN || /[^A-Za-z0-9_\-.\s]/.test(name)) {
    throw new ToolError(
      'bad_path',
      `name must be ≤${MAX_NAME_LEN} chars and match [A-Za-z0-9_\\-. ]+`,
      400,
    );
  }
  return { namespace, name, raw: trimmed };
}

function extractToolName(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const value = metadata.anthropic_tool_name;
  return typeof value === 'string' ? value : null;
}

async function findMemoryByPath(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
): Promise<MemoryRow | null> {
  if (!parsed.namespace || !parsed.name) return null;
  // R12 audit fix (B6): .maybeSingle() throws PGRST116 if multiple rows
  // share the same metadata.anthropic_tool_name (race in handleCreate or
  // collision with a /api/v1/memories caller that put the same key in
  // their metadata). Order by created_at DESC and take the most recent
  // row instead — the partial unique index from migration 20260508010
  // prevents new collisions, but old rows may still exist.
  const { data, error } = await supabase
    .from('memories')
    .select('id, content, namespace, metadata, is_deleted, user_id')
    .eq('user_id', userId)
    .eq('is_deleted', false)
    .eq('namespace', parsed.namespace)
    .contains('metadata', { anthropic_tool_name: parsed.name })
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) reportDbError('findMemoryByPath', error);
  return (data && data[0] as MemoryRow) || null;
}

async function requireMemoryAtPath(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  parsed: ParsedPath,
): Promise<MemoryRow> {
  if (!parsed.namespace || !parsed.name) {
    throw new ToolError('bad_path', `path must be /memories/<ns>/<name>`, 400);
  }
  const row = await findMemoryByPath(supabase, userId, parsed);
  if (!row) {
    throw new ToolError('not_found', `No memory at ${parsed.raw}`, 404);
  }
  return row;
}

function formatListing(parent: string, entries: string[]): string {
  if (entries.length === 0) return `${parent}/ (empty)`;
  return entries.map((e) => `${parent.replace(/\/$/, '')}/${e}`).join('\n');
}
