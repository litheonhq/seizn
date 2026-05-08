/**
 * Obsidian vault import endpoint (R10 — locked 2026-05-08).
 *
 * Bulk-imports notes from an Obsidian vault into Seizn /api/v1/memories.
 * Designed as the canonical contract for any Obsidian community plugin
 * or third-party MCP server that wants to push vault state into Seizn.
 *
 * Strategic context: Obsidian-using authors are the highest-density
 * vocal segment in the writer market (8+ existing OSS MCP servers
 * confirms demand). This endpoint is the server-side half — pair it
 * with a community Obsidian plugin (separate repo, future work) to
 * close the loop.
 *
 * Surface:
 *   POST /api/v1/integrations/obsidian/import
 *   Auth: same Bearer szn_... API key as the rest of /api/v1/
 *   Body: {
 *     vault_name: string,             // namespace suffix, e.g. "novel-draft-2026"
 *     notes: Array<{
 *       path: string,                 // vault-relative path, e.g. "characters/Sarah.md"
 *       content: string,              // markdown body (minus frontmatter, optional)
 *       frontmatter?: Record<string, unknown>,
 *       modified_at?: string          // ISO; informs valid_at for R9 temporal layer
 *     }>,
 *     replace_existing?: boolean      // default false; when true, soft-delete previous
 *                                     //   memories at the same obsidian_path before insert
 *   }
 *
 * Response:
 *   200 {
 *     vault_name,
 *     imported: number,
 *     skipped: number,
 *     errors: Array<{ path: string, reason: string }>
 *   }
 *
 * Per-note mapping into memories:
 *   - namespace          = `obsidian:${vault_name}`
 *   - content            = note.content
 *   - source             = 'obsidian'
 *   - tags               = frontmatter.tags (if array of strings)
 *   - valid_at           = note.modified_at (R9 temporal — when fact became true)
 *   - metadata.obsidian_path        = note.path
 *   - metadata.obsidian_frontmatter = note.frontmatter
 *   - metadata.obsidian_vault       = vault_name
 *
 * Dedup: existing unique index on (user_id, namespace, content_hash)
 * means re-importing identical content is a no-op (returns skipped=N).
 *
 * Limits: max 200 notes per request, max 200KB per note (matches the
 * Anthropic memory tool adapter ceiling for parity).
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface NoteInput {
  path: unknown;
  content: unknown;
  frontmatter?: unknown;
  modified_at?: unknown;
}

interface ImportBody {
  vault_name?: unknown;
  notes?: unknown;
  replace_existing?: unknown;
}

interface NormalizedNote {
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: string | null;
  contentHash: string;
}

const MAX_NOTES_PER_REQUEST = 200;
const MAX_BYTES_PER_NOTE = 200_000;
const MAX_VAULT_NAME_LEN = 64;
const MAX_PATH_LEN = 512;
const VAULT_NAME_RE = /^[A-Za-z0-9_\-:.]+$/;

// R12 audit fix (A3): metadata keys reserved for cross-channel identity
// or trust-decisions. Strip these from caller-supplied frontmatter so
// an Obsidian plugin can't shadow R8 (anthropic-tool) memories or
// inject security-relevant fields.
const RESERVED_METADATA_KEYS: readonly string[] = [
  'anthropic_tool_name',
  'anthropic_tool_path',
  'obsidian_path',
  'obsidian_vault',
  'obsidian_frontmatter',
  'role',
  'user_id',
  'org_id',
  'organization_id',
];

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: false });
  if (isAuthError(authResult)) {
    return authErrorResponse(authResult.authError);
  }
  const userId = authResult.userId;

  let body: ImportBody;
  try {
    body = (await request.json()) as ImportBody;
  } catch {
    return jsonError('invalid_body', 'Request body must be valid JSON', 400);
  }

  const vaultName = typeof body.vault_name === 'string' ? body.vault_name.trim() : '';
  if (!vaultName) {
    return jsonError('missing_vault_name', 'vault_name is required', 400);
  }
  if (vaultName.length > MAX_VAULT_NAME_LEN || !VAULT_NAME_RE.test(vaultName)) {
    return jsonError(
      'invalid_vault_name',
      `vault_name must be ≤${MAX_VAULT_NAME_LEN} chars and match ${VAULT_NAME_RE}`,
      400,
    );
  }

  const namespace = `obsidian:${vaultName}`;
  const replaceExisting = body.replace_existing === true;

  if (!Array.isArray(body.notes)) {
    return jsonError('missing_notes', 'notes must be an array', 400);
  }
  if (body.notes.length === 0) {
    return NextResponse.json({
      vault_name: vaultName,
      imported: 0,
      skipped: 0,
      errors: [],
    });
  }
  if (body.notes.length > MAX_NOTES_PER_REQUEST) {
    return jsonError(
      'too_many_notes',
      `notes per request capped at ${MAX_NOTES_PER_REQUEST}; received ${body.notes.length}`,
      413,
    );
  }

  const errors: Array<{ path: string; reason: string }> = [];
  const normalized: NormalizedNote[] = [];

  for (const raw of body.notes as NoteInput[]) {
    const result = normalizeNote(raw);
    if ('error' in result) {
      const path = typeof raw?.path === 'string' ? raw.path : '<unknown>';
      errors.push({ path, reason: result.error });
      continue;
    }
    normalized.push(result.note);
  }

  const supabase = createServerClient();

  // When replace_existing=true, soft-delete previous memories at the same
  // obsidian_path before insert so the import is idempotent on re-runs.
  // Path-keyed delete uses metadata.obsidian_path (jsonb @> match).
  if (replaceExisting && normalized.length > 0) {
    const paths = normalized.map((n) => n.path);
    for (const p of paths) {
      const { error } = await supabase
        .from('memories')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('namespace', namespace)
        .contains('metadata', { obsidian_path: p })
        .eq('is_deleted', false);
      if (error) {
        // R12 audit fix (A2): don't echo Postgres error message to the caller.
        console.error(`[obsidian-import] replace_existing failed: ${error.message ?? 'unknown'}`);
        errors.push({ path: p, reason: 'replace_existing failed' });
      }
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const note of normalized) {
    const tags = extractTagsFromFrontmatter(note.frontmatter);
    // R12 audit fix (A3): strip reserved metadata keys so an Obsidian
    // plugin can't shadow anthropic-tool paths or inject role/user_id.
    const sanitizedFrontmatter = stripReservedMetadataKeys(note.frontmatter ?? {});
    const insertPayload = {
      user_id: userId,
      namespace,
      content: note.content,
      content_hash: note.contentHash,
      source: 'obsidian',
      memory_type: 'fact',
      tags,
      ...(note.modifiedAt ? { valid_at: note.modifiedAt } : {}),
      metadata: {
        obsidian_path: note.path,
        obsidian_frontmatter: sanitizedFrontmatter,
        obsidian_vault: vaultName,
      },
    };
    const { error } = await supabase.from('memories').insert(insertPayload);
    if (!error) {
      imported += 1;
      continue;
    }
    // R12 audit fix (B7): partial unique on (user_id, namespace,
    // metadata->>obsidian_path) catches concurrent imports racing on
    // the same path. Existing dedup via (user_id, namespace, content_hash)
    // also fires. Both classify as 'skipped' from the caller's view.
    const message = error.message ?? '';
    if (
      message.includes('duplicate key') ||
      message.includes('idx_memories_content_hash') ||
      message.includes('idx_memories_obsidian_path_unique')
    ) {
      skipped += 1;
      continue;
    }
    // R12 audit fix (A2): never surface raw Postgres error.message.
    console.error(`[obsidian-import] insert ${note.path} failed: ${message || 'unknown'}`);
    errors.push({ path: note.path, reason: 'insert failed' });
  }

  return NextResponse.json({
    vault_name: vaultName,
    imported,
    skipped,
    errors,
  });
}

function normalizeNote(
  raw: NoteInput | null | undefined,
): { note: NormalizedNote } | { error: string } {
  if (!raw || typeof raw !== 'object') {
    return { error: 'note must be an object' };
  }
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  if (!path) return { error: 'path is required' };
  if (path.length > MAX_PATH_LEN) {
    return { error: `path exceeds ${MAX_PATH_LEN} chars` };
  }
  if (!path.endsWith('.md')) {
    return { error: 'path must end with .md' };
  }
  // R12 audit fix (A7+C8): path traversal hardening. Reject leading /,
  // backslashes, drive letters (Windows-style), .. segments, control
  // chars, and anything that would let metadata.obsidian_path become
  // a filesystem or URL path elsewhere. Obsidian itself emits forward-
  // slash vault-relative paths, so this matches the canonical form.
  if (
    path.startsWith('/') ||
    path.startsWith('\\') ||
    path.includes('\\') ||
    /^[A-Za-z]:/.test(path) ||
    path.split('/').some((seg) => seg === '..' || seg === '.') ||
    /[\x00-\x1f]/.test(path)
  ) {
    return { error: 'path must be a forward-slash vault-relative path with no .. segments' };
  }
  const content = typeof raw.content === 'string' ? raw.content : '';
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_BYTES_PER_NOTE) {
    return { error: `content exceeds ${MAX_BYTES_PER_NOTE} bytes` };
  }
  let frontmatter: Record<string, unknown> | null = null;
  if (raw.frontmatter !== undefined && raw.frontmatter !== null) {
    if (typeof raw.frontmatter !== 'object' || Array.isArray(raw.frontmatter)) {
      return { error: 'frontmatter must be an object' };
    }
    frontmatter = raw.frontmatter as Record<string, unknown>;
  }
  let modifiedAt: string | null = null;
  if (raw.modified_at !== undefined && raw.modified_at !== null) {
    if (typeof raw.modified_at !== 'string') {
      return { error: 'modified_at must be an ISO string' };
    }
    if (Number.isNaN(Date.parse(raw.modified_at))) {
      return { error: 'modified_at must be a valid ISO timestamp' };
    }
    modifiedAt = raw.modified_at;
  }
  // R12 audit fix (C1): content_hash is on body alone now. Vault
  // identity (path) lives in metadata.obsidian_path with its own
  // partial unique index (migration 20260508010). Pre-fix the hash
  // mixed path with content, so an Obsidian rename produced a brand-
  // new memory while the old one stayed alive — silent vault
  // divergence. Path uniqueness and content dedup are now independent.
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');
  return {
    note: {
      path,
      content,
      frontmatter,
      modifiedAt,
      contentHash,
    },
  };
}

function extractTagsFromFrontmatter(
  frontmatter: Record<string, unknown> | null,
): string[] {
  if (!frontmatter) return [];
  const raw = frontmatter.tags ?? frontmatter.tag;
  if (Array.isArray(raw)) {
    return raw
      .filter((t): t is string => typeof t === 'string')
      .map(normalizeTag)
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof raw === 'string') {
    // R12 audit fix (C9): Obsidian YAML can be `tags: foo, bar` or
    // `tags: '#foo #bar'` (hashtag-prefixed). Split on commas first; if
    // no comma, fall back to whitespace. normalizeTag strips leading #.
    const parts = raw.includes(',') ? raw.split(',') : raw.split(/\s+/);
    return parts.map(normalizeTag).filter(Boolean).slice(0, 20);
  }
  return [];
}

function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '').trim();
}

// R12 audit fix (A3): metadata keys reserved for cross-channel identity
// or trust-decisions are stripped from caller-supplied frontmatter so
// an Obsidian plugin can't shadow R8 anthropic-tool memories or inject
// security-relevant fields. Underscore-prefixed keys (convention for
// internal flags) and exact reserved names are removed.
function stripReservedMetadataKeys(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key.startsWith('_')) continue;
    if (RESERVED_METADATA_KEYS.includes(key)) continue;
    result[key] = value;
  }
  return result;
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
