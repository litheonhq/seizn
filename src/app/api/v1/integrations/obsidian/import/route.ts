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
 *
 * Content-security pipeline (R13 A4 + R15 H1):
 *   Applied per-note synchronously:
 *     1. Strip null bytes (Postgres rejects \0 in text columns).
 *     2. Prompt-firewall scan (createDetector mode=sanitize). Critical
 *        threats reject the individual note; lower threats sanitize.
 *   NOT applied (security gap, opt-in only):
 *     - LLM moderation (`moderate()`) — would burn ~200 LLM calls per
 *       batch, breaks Free-tier cost model. Notes are flagged with
 *       `metadata.moderation_pending = true` and indexed by
 *       `idx_memories_moderation_pending` (migration 20260508012) so
 *       an async sweep can be added later. NO sweep ships today —
 *       imported rows enter without moderation. Callers needing strict
 *       moderation must call /api/v1/memories POST per-note instead.
 *     - Canon enforcement — Studio-tier feature with NPC/session scope
 *       that doesn't fit a vault-bulk model.
 *     - Hot memory budget reservation — cold-tier path; budget
 *       enforcement happens at organization level on next promote.
 *   This gap is intentional but loud-fail: any future SECURITY.md must
 *   note that Obsidian-imported rows are equivalent to /api/v1/memories
 *   POST with moderation disabled.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { createServerClient } from '@/lib/supabase';
import { createDetector } from '@/lib/prompt-firewall/scanner';
import { compareThreatLevel } from '@/lib/prompt-firewall/patterns';
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

  let imported = 0;
  let skipped = 0;

  // R15 M6 — single atomic RPC per note. Pre-fix used a 2-step
  // UPDATE-then-INSERT flow that raced concurrent callers
  // re-importing the same path. obsidian_upsert_note (migration
  // 20260508012) wraps the lookup + upsert in one Postgres
  // transaction with FOR UPDATE; partial unique index is the backstop.
  for (const note of normalized) {
    const tags = extractTagsFromFrontmatter(note.frontmatter);
    const sanitizedFrontmatter = stripReservedMetadataKeys(note.frontmatter ?? {});
    const metadata = {
      obsidian_path: note.path,
      obsidian_frontmatter: sanitizedFrontmatter,
      obsidian_vault: vaultName,
      // R13 A4 + R15 H1 — flag intended for an async moderation sweep
      // job. The sweep itself is NOT implemented today; rows ship into
      // prod without LLM moderation, equivalent to /api/v1/memories
      // POST with moderation disabled. The flag + supporting index
      // (idx_memories_moderation_pending) lets a future cron pick up
      // pending rows in bounded batches without a full-table scan.
      moderation_pending: true,
    };
    const { data, error } = await supabase.rpc('obsidian_upsert_note', {
      p_user_id: userId,
      p_namespace: namespace,
      p_path: note.path,
      p_content: note.content,
      p_content_hash: note.contentHash,
      p_tags: tags,
      p_modified_at: note.modifiedAt,
      p_metadata: metadata,
      p_replace_existing: replaceExisting,
    });
    if (error) {
      // R12 audit fix (A2): never surface raw Postgres error.message.
      console.error(`[obsidian-import] upsert ${note.path} failed: ${error.message ?? 'unknown'}`);
      errors.push({ path: note.path, reason: 'upsert failed' });
      continue;
    }
    // RPC returns 'imported' | 'updated' | 'skipped'. 'updated' counts as
    // imported from the caller's view (their note is now in the system);
    // 'skipped' covers concurrent-insert race + replace_existing=false
    // path collision.
    if (data === 'skipped') {
      skipped += 1;
    } else {
      imported += 1;
    }
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
  // R13 A4 — apply the same content-security primitives as
  // /api/v1/memories POST: strip null bytes (Postgres text columns
  // reject \0 and pad attacks), then run the prompt-firewall scanner.
  // Critical threats abort the note (vault import is bulk so we soft-
  // fail per-note rather than the whole batch); lower-severity threats
  // get sanitized in-place. Moderation + canon enforcement are NOT
  // applied here — see the route comment for rationale and the async
  // follow-up plan.
  const rawContent = typeof raw.content === 'string' ? raw.content : '';
  let content = rawContent.replace(/\x00/g, '');
  if (content) {
    const detector = createDetector({ mode: 'sanitize' });
    const firewall = detector.scan(content);
    if (firewall.detected && compareThreatLevel(firewall.threatLevel, 'critical') >= 0) {
      return {
        error: `content blocked by prompt firewall (${firewall.threatLevel})`,
      };
    }
    if (firewall.sanitizedInput && firewall.sanitizedInput.trim().length > 0) {
      content = firewall.sanitizedInput;
    }
  }
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
//
// R15 LOW 8: recurse into nested plain objects so a frontmatter shaped
// like { custom: { anthropic_tool_path: '...' } } can't smuggle reserved
// keys past a top-level filter. Today no consumer queries nested paths
// (all checks use top-level metadata->>'<reserved>'), so this is purely
// defensive — any future path-expression query stays safe.
function stripReservedMetadataKeys(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key.startsWith('_')) continue;
    if (RESERVED_METADATA_KEYS.includes(key)) continue;
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = stripReservedMetadataKeys(value as Record<string, unknown>);
      continue;
    }
    result[key] = value;
  }
  return result;
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}
