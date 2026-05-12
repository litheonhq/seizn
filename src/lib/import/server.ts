import { createHash } from "node:crypto";
import { parseConvaiExport } from "./convai";
import { parseInworldExport } from "./inworld";
import { parseRivetExport } from "./rivet";
import {
  type CompetitorImportSource,
  type ImportJobView,
  type ImportPreviewSummary,
  type ImportStatus,
  type NormalizedImportBelief,
  type NormalizedImportBundle,
  type NormalizedImportCanonLock,
  type NormalizedImportMemory,
} from "./types";
import { createServerClient } from "@/lib/supabase";

type SupabaseLike = ReturnType<typeof createServerClient>;

interface ImportContext {
  supabase: SupabaseLike;
  userId: string;
  organizationId: string;
}

interface ImportJobRow {
  id: string;
  source: CompetitorImportSource;
  status: ImportStatus;
  filename: string | null;
  summary: ImportPreviewSummary;
  normalized_payload: NormalizedImportBundle;
  inserted_memory_ids: string[] | null;
  inserted_canon_lock_ids: string[] | null;
  inserted_belief_ids: string[] | null;
  created_at: string;
  committed_at: string | null;
  rolled_back_at: string | null;
}

export function parseCompetitorImportSource(value: unknown): CompetitorImportSource | null {
  return value === "inworld" || value === "convai" || value === "rivet" ? value : null;
}

export function parseCompetitorImport(source: CompetitorImportSource, content: string): NormalizedImportBundle {
  const raw = JSON.parse(content) as unknown;
  if (source === "inworld") return parseInworldExport(raw);
  if (source === "convai") return parseConvaiExport(raw);
  return parseRivetExport(raw);
}

export function summarizeImport(bundle: NormalizedImportBundle): ImportPreviewSummary {
  return {
    memories: bundle.memories.length,
    canonLocks: bundle.canonLocks.length,
    beliefs: bundle.beliefs.length,
    totalEntities: bundle.memories.length + bundle.canonLocks.length + bundle.beliefs.length,
    warnings: bundle.warnings.length,
  };
}

function normalizeJob(row: ImportJobRow): ImportJobView {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    filename: row.filename,
    summary: row.summary,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    rolledBackAt: row.rolled_back_at,
    insertedMemoryIds: row.inserted_memory_ids || [],
    insertedCanonLockIds: row.inserted_canon_lock_ids || [],
    insertedBeliefIds: row.inserted_belief_ids || [],
  };
}

function hashImportContent(source: CompetitorImportSource, externalId: string, content: string): string {
  return createHash("sha256").update(`${source}:${externalId}:${content}`).digest("hex");
}

export async function createImportPreview(
  ctx: ImportContext,
  input: { source: CompetitorImportSource; content: string; filename?: string | null }
): Promise<{ job: ImportJobView; bundle: NormalizedImportBundle }> {
  const bundle = parseCompetitorImport(input.source, input.content);
  const summary = summarizeImport(bundle);
  const { data, error } = await ctx.supabase
    .from("import_jobs")
    .insert({
      organization_id: ctx.organizationId,
      user_id: ctx.userId,
      source: input.source,
      status: "previewed",
      filename: input.filename || null,
      source_hash: createHash("sha256").update(input.content).digest("hex"),
      summary,
      normalized_payload: bundle,
      raw_stats: bundle.rawStats,
    })
    .select("id, source, status, filename, summary, normalized_payload, inserted_memory_ids, inserted_canon_lock_ids, inserted_belief_ids, created_at, committed_at, rolled_back_at")
    .single();

  if (error || !data) {
    throw new Error(`import_preview_create_failed: ${error?.message || "unknown"}`);
  }

  return { job: normalizeJob(data as ImportJobRow), bundle };
}

async function loadJobRow(ctx: ImportContext, jobId: string): Promise<ImportJobRow> {
  const { data, error } = await ctx.supabase
    .from("import_jobs")
    .select("id, source, status, filename, summary, normalized_payload, inserted_memory_ids, inserted_canon_lock_ids, inserted_belief_ids, created_at, committed_at, rolled_back_at")
    .eq("id", jobId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  if (error) throw new Error(`import_job_load_failed: ${error.message}`);
  if (!data) throw new Error("import_job_not_found");
  return data as ImportJobRow;
}

export async function loadImportJob(ctx: ImportContext, jobId: string): Promise<ImportJobView> {
  return normalizeJob(await loadJobRow(ctx, jobId));
}

function memoryInsertRow(ctx: ImportContext, source: CompetitorImportSource, memory: NormalizedImportMemory) {
  return {
    user_id: ctx.userId,
    organization_id: ctx.organizationId,
    content: memory.content,
    memory_type: memory.memoryType,
    namespace: memory.namespace,
    tags: memory.tags,
    scope: "organization",
    source: `competitor-import:${source}`,
    agent_id: memory.npcId,
    companion_meta: {
      npc_id: memory.npcId,
      import_external_id: memory.externalId,
      ...memory.metadata,
    },
    importance: 6,
    confidence: 0.92,
    content_hash: hashImportContent(source, memory.externalId, memory.content),
    is_encrypted: false,
    is_deleted: false,
    deleted_at: null,
  };
}

function canonInsertRow(ctx: ImportContext, lock: NormalizedImportCanonLock) {
  return {
    studio_id: ctx.organizationId,
    npc_id: lock.npcId,
    scope: lock.scope,
    statement: lock.statement,
    severity: lock.severity,
    active: true,
    created_by: ctx.userId,
  };
}

function beliefMemoryFromBelief(belief: NormalizedImportBelief): NormalizedImportMemory {
  return {
    externalId: `belief-memory-${belief.externalId}`,
    content: belief.content,
    npcId: belief.holderEntityId,
    memoryType: "belief",
    namespace: "import/rivet",
    tags: ["import", "rivet", "belief"],
    metadata: {
      ...belief.metadata,
      holder_entity_id: belief.holderEntityId,
    },
  };
}

export async function commitImportJob(ctx: ImportContext, jobId: string): Promise<{ job: ImportJobView }> {
  const row = await loadJobRow(ctx, jobId);
  if (row.status === "committed") return { job: normalizeJob(row) };
  if (row.status === "rolled_back") throw new Error("import_job_already_rolled_back");
  if (row.status !== "previewed") throw new Error(`import_job_not_committable:${row.status}`);

  const bundle = row.normalized_payload;
  const insertedMemoryIds: string[] = [];
  const insertedCanonLockIds: string[] = [];
  const insertedBeliefIds: string[] = [];

  const memoryRows = [
    ...bundle.memories,
    ...bundle.beliefs.map(beliefMemoryFromBelief),
  ].map((memory) => memoryInsertRow(ctx, bundle.source, memory));

  if (memoryRows.length > 0) {
    const { data, error } = await ctx.supabase.from("memories").insert(memoryRows).select("id");
    if (error) throw new Error(`import_memory_insert_failed: ${error.message}`);
    for (const item of data || []) insertedMemoryIds.push(String(item.id));
  }

  if (bundle.canonLocks.length > 0) {
    const { data, error } = await ctx.supabase
      .from("canon_locks")
      .insert(bundle.canonLocks.map((lock) => canonInsertRow(ctx, lock)))
      .select("id");
    if (error) throw new Error(`import_canon_insert_failed: ${error.message}`);
    for (const item of data || []) insertedCanonLockIds.push(String(item.id));
  }

  const beliefMemoryOffset = bundle.memories.length;
  if (bundle.beliefs.length > 0) {
    const beliefRows = bundle.beliefs.map((belief, index) => ({
      organization_id: ctx.organizationId,
      holder_entity_id: belief.holderEntityId,
      about_fact_id: insertedMemoryIds[beliefMemoryOffset + index],
      observed_at: belief.observedAt || new Date().toISOString(),
      confidence: belief.confidence,
      source_type: belief.sourceType,
    }));
    const { data, error } = await ctx.supabase.from("belief_shards").insert(beliefRows).select("id");
    if (error) throw new Error(`import_belief_insert_failed: ${error.message}`);
    for (const item of data || []) insertedBeliefIds.push(String(item.id));
  }

  const { data: updated, error: updateError } = await ctx.supabase
    .from("import_jobs")
    .update({
      status: "committed",
      inserted_memory_ids: insertedMemoryIds,
      inserted_canon_lock_ids: insertedCanonLockIds,
      inserted_belief_ids: insertedBeliefIds,
      committed_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", jobId)
    .eq("organization_id", ctx.organizationId)
    .select("id, source, status, filename, summary, normalized_payload, inserted_memory_ids, inserted_canon_lock_ids, inserted_belief_ids, created_at, committed_at, rolled_back_at")
    .single();

  if (updateError || !updated) {
    throw new Error(`import_job_update_failed: ${updateError?.message || "unknown"}`);
  }

  return { job: normalizeJob(updated as ImportJobRow) };
}

export async function rollbackImportJob(ctx: ImportContext, jobId: string): Promise<{ job: ImportJobView }> {
  const row = await loadJobRow(ctx, jobId);
  if (row.status === "rolled_back") return { job: normalizeJob(row) };
  if (row.status !== "committed") throw new Error(`import_job_not_rollbackable:${row.status}`);

  const beliefIds = row.inserted_belief_ids || [];
  const lockIds = row.inserted_canon_lock_ids || [];
  const memoryIds = row.inserted_memory_ids || [];

  if (beliefIds.length > 0) {
    const { error } = await ctx.supabase
      .from("belief_shards")
      .update({ revoked_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId)
      .in("id", beliefIds);
    if (error) throw new Error(`import_belief_rollback_failed: ${error.message}`);
  }

  if (lockIds.length > 0) {
    const { error } = await ctx.supabase
      .from("canon_locks")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("studio_id", ctx.organizationId)
      .in("id", lockIds);
    if (error) throw new Error(`import_canon_rollback_failed: ${error.message}`);
  }

  if (memoryIds.length > 0) {
    const { error } = await ctx.supabase
      .from("memories")
      .update({ is_deleted: true, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("organization_id", ctx.organizationId)
      .in("id", memoryIds);
    if (error) throw new Error(`import_memory_rollback_failed: ${error.message}`);
  }

  const { data: updated, error: updateError } = await ctx.supabase
    .from("import_jobs")
    .update({ status: "rolled_back", rolled_back_at: new Date().toISOString(), error_message: null })
    .eq("id", jobId)
    .eq("organization_id", ctx.organizationId)
    .select("id, source, status, filename, summary, normalized_payload, inserted_memory_ids, inserted_canon_lock_ids, inserted_belief_ids, created_at, committed_at, rolled_back_at")
    .single();

  if (updateError || !updated) {
    throw new Error(`import_job_rollback_update_failed: ${updateError?.message || "unknown"}`);
  }

  return { job: normalizeJob(updated as ImportJobRow) };
}
