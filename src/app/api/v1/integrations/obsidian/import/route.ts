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
        errors.push({ path: p, reason: `replace_existing failed: ${error.message}` });
      }
    }
  }

  let imported = 0;
  let skipped = 0;

  for (const note of normalized) {
    const tags = extractTagsFromFrontmatter(note.frontmatter);
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
        obsidian_frontmatter: note.frontmatter ?? {},
        obsidian_vault: vaultName,
      },
    };
    const { error } = await supabase.from('memories').insert(insertPayload);
    if (!error) {
      imported += 1;
      continue;
    }
    // Unique index on (user_id, namespace, content_hash) → duplicate is the
    // happy-path "skipped". Surface other errors to the caller.
    const message = error.message || '';
    if (
      message.includes('duplicate key') ||
      message.includes('idx_memories_content_hash')
    ) {
      skipped += 1;
      continue;
    }
    errors.push({ path: note.path, reason: message });
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
  // Hash on (path, content) so two notes with identical content but
  // different paths are NOT treated as duplicates — the user often
  // wants both, and the path itself is meaningful canonical identity.
  const contentHash = crypto
    .createHash('sha256')
    .update(`${path} ${content}`)
    .digest('hex');
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
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  return [];
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
