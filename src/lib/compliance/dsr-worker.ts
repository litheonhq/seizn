import crypto from 'crypto';
import type { createServerClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit/logger';
import { sha256 } from '@/lib/audit/tamper-evident';
import {
  buildDeletionCertificate,
  buildDsrArchive,
  canonicalizeForCompliance,
  type DeletionCertificate,
  type DsrArchive,
  type DsrJobStatus,
  type DsrJobType,
  type SubjectAuditRecord,
  type SubjectInteractionRecord,
  type SubjectMemoryRecord,
} from './dsr';
import type { DsrObjectStore } from './dsr-object-store';

type Supabase = ReturnType<typeof createServerClient>;

export type DsrPublicJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface DsrSessionActor {
  userId: string;
  organizationId: string;
}

export interface DsrJobRow {
  id: string;
  organization_id: string;
  requested_by: string | null;
  api_key_id?: string | null;
  type: DsrJobType;
  subject_id: string;
  status: DsrJobStatus | string;
  reason?: string | null;
  artifact_url?: string | null;
  artifact?: unknown;
  certificate?: unknown;
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

export interface DsrJobStatusPayload {
  jobId: string;
  jobType: DsrJobType;
  subjectId: string;
  status: DsrPublicJobStatus;
  downloadUrl: string | null;
  errorMessage: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

export interface DsrWorkerResult {
  processed: boolean;
  jobId?: string;
  jobType?: DsrJobType;
  status?: DsrPublicJobStatus;
  downloadUrl?: string | null;
  tombstoneId?: string | null;
}

const EXPORT_TTL_SECONDS = 7 * 24 * 60 * 60;
const STATUS_CONSTRAINT_ERROR = '23514';

function normalizeSubjectId(subjectId: string): string {
  const trimmed = subjectId.trim();
  if (!trimmed || trimmed.length > 256) {
    throw new Error('subjectId must be 1-256 characters');
  }
  return trimmed;
}

export function toPublicDsrStatus(status: string | null | undefined): DsrPublicJobStatus {
  if (status === 'processing' || status === 'running') return 'processing';
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'queued';
}

function isStatusConstraintError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string | null; message?: string | null };
  return candidate.code === STATUS_CONSTRAINT_ERROR || /status.*check/i.test(candidate.message || '');
}

function legacyStatus(status: DsrJobStatus | string): DsrJobStatus | string {
  if (status === 'queued') return 'pending';
  if (status === 'processing') return 'running';
  return status;
}

function mapJob(row: Record<string, unknown>): DsrJobRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    requested_by: typeof row.requested_by === 'string' ? row.requested_by : null,
    api_key_id: typeof row.api_key_id === 'string' ? row.api_key_id : null,
    type: row.type === 'delete' ? 'delete' : 'export',
    subject_id: String(row.subject_id),
    status: String(row.status || 'queued'),
    reason: typeof row.reason === 'string' ? row.reason : null,
    artifact_url: typeof row.artifact_url === 'string' ? row.artifact_url : null,
    artifact: row.artifact,
    certificate: row.certificate,
    error_message: typeof row.error_message === 'string' ? row.error_message : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
  };
}

function publicPayload(job: DsrJobRow): DsrJobStatusPayload {
  return {
    jobId: job.id,
    jobType: job.type,
    subjectId: job.subject_id,
    status: toPublicDsrStatus(job.status),
    downloadUrl: job.type === 'export' && toPublicDsrStatus(job.status) === 'completed'
      ? job.artifact_url || null
      : null,
    errorMessage: job.error_message || null,
    createdAt: job.created_at || null,
    completedAt: job.completed_at || null,
  };
}

async function logDsrTransition(
  job: Pick<DsrJobRow, 'id' | 'organization_id' | 'requested_by' | 'subject_id' | 'type'>,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  await logAuditEvent(
    {
      userId: job.requested_by || 'system',
      apiKeyId: undefined,
      isServiceRole: true,
    },
    {
      action,
      resourceType: 'dsr_job',
      resourceId: job.id,
      teamId: job.organization_id,
      details: {
        job_type: job.type,
        subject_id: job.subject_id,
        ...details,
      },
    }
  );
}

async function insertJobWithStatusFallback(
  supabase: Supabase,
  payload: Record<string, unknown>
): Promise<DsrJobRow> {
  const insert = async (status: string) =>
    supabase
      .from('dsr_jobs')
      .insert({ ...payload, status })
      .select('id, organization_id, requested_by, api_key_id, type, subject_id, status, reason, artifact_url, artifact, certificate, error_message, created_at, completed_at')
      .single();

  let result = await insert('queued');
  if (result.error && isStatusConstraintError(result.error)) {
    result = await insert('pending');
  }
  if (result.error) throw result.error;
  return mapJob(result.data as Record<string, unknown>);
}

export async function enqueueDsrJob(
  supabase: Supabase,
  params: {
    actor: DsrSessionActor;
    jobType: DsrJobType;
    subjectId: string;
    reason?: string | null;
  }
): Promise<DsrJobStatusPayload> {
  const subjectId = normalizeSubjectId(params.subjectId);
  const jobId = crypto.randomUUID();
  const job = await insertJobWithStatusFallback(supabase, {
    id: jobId,
    organization_id: params.actor.organizationId,
    requested_by: params.actor.userId,
    api_key_id: null,
    type: params.jobType,
    subject_id: subjectId,
    reason: params.reason || null,
    artifact_url: null,
    artifact: null,
    certificate: null,
    error_message: null,
    completed_at: null,
  });
  await logDsrTransition(job, 'dsr.queued');
  return publicPayload({ ...job, status: 'queued' });
}

export async function listDsrJobs(
  supabase: Supabase,
  organizationId: string,
  limit = 50
): Promise<DsrJobStatusPayload[]> {
  const { data, error } = await supabase
    .from('dsr_jobs')
    .select('id, organization_id, requested_by, api_key_id, type, subject_id, status, reason, artifact_url, artifact, certificate, error_message, created_at, completed_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data || []) as Record<string, unknown>[]).map(mapJob).map(publicPayload);
}

export async function getDsrJobStatus(
  supabase: Supabase,
  organizationId: string,
  jobId: string
): Promise<DsrJobStatusPayload | null> {
  const { data, error } = await supabase
    .from('dsr_jobs')
    .select('id, organization_id, requested_by, api_key_id, type, subject_id, status, reason, artifact_url, artifact, certificate, error_message, created_at, completed_at')
    .eq('organization_id', organizationId)
    .eq('id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data ? publicPayload(mapJob(data as Record<string, unknown>)) : null;
}

async function updateJob(
  supabase: Supabase,
  job: DsrJobRow,
  updates: Record<string, unknown>
): Promise<DsrJobRow> {
  const run = async (payload: Record<string, unknown>) =>
    supabase
      .from('dsr_jobs')
      .update(payload)
      .eq('id', job.id)
      .eq('organization_id', job.organization_id)
      .select('id, organization_id, requested_by, api_key_id, type, subject_id, status, reason, artifact_url, artifact, certificate, error_message, created_at, completed_at')
      .single();

  let result = await run(updates);
  if (result.error && updates.status && isStatusConstraintError(result.error)) {
    result = await run({ ...updates, status: legacyStatus(String(updates.status)) });
  }
  if (result.error) throw result.error;
  return mapJob(result.data as Record<string, unknown>);
}

async function claimNextDsrJob(supabase: Supabase): Promise<DsrJobRow | null> {
  const claimed = await supabase.rpc('claim_next_dsr_job');
  if (!claimed.error) {
    const rows = Array.isArray(claimed.data)
      ? claimed.data
      : claimed.data
        ? [claimed.data]
        : [];
    return rows[0] ? mapJob(rows[0] as Record<string, unknown>) : null;
  }

  const message = String(claimed.error.message || '').toLowerCase();
  if (!message.includes('claim_next_dsr_job') && claimed.error.code !== '42883') {
    throw claimed.error;
  }

  const { data, error } = await supabase
    .from('dsr_jobs')
    .select('id, organization_id, requested_by, api_key_id, type, subject_id, status, reason, artifact_url, artifact, certificate, error_message, created_at, completed_at')
    .in('status', ['queued', 'pending'])
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  const row = Array.isArray(data) && data[0] ? mapJob(data[0] as Record<string, unknown>) : null;
  if (!row) return null;
  return updateJob(supabase, row, {
    status: row.status === 'queued' ? 'processing' : 'running',
  });
}

async function fetchSubjectMemories(
  supabase: Supabase,
  organizationId: string,
  subjectId: string
): Promise<SubjectMemoryRecord[]> {
  const { data, error } = await supabase
    .from('memories')
    .select('id, user_id, organization_id, subject_id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, scope, session_id, agent_id, source, importance, created_at, updated_at, deleted_at, is_deleted')
    .eq('organization_id', organizationId)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return (data || []) as SubjectMemoryRecord[];
}

function auditMatchesSubject(row: SubjectAuditRecord, subjectId: string, memoryIds: Set<string>): boolean {
  const details = row.details || {};
  return details.subject_id === subjectId ||
    details.subjectId === subjectId ||
    Boolean(row.resource_id && memoryIds.has(row.resource_id));
}

async function fetchSubjectAuditLogs(
  supabase: Supabase,
  organizationId: string,
  subjectId: string,
  memoryIds: string[]
): Promise<SubjectAuditRecord[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, user_id, organization_id, api_key_id, action, resource_type, resource_id, details, status, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  const memoryIdSet = new Set(memoryIds);
  return ((data || []) as SubjectAuditRecord[]).filter((row) =>
    auditMatchesSubject(row, subjectId, memoryIdSet)
  );
}

async function fetchSubjectInteractions(
  supabase: Supabase,
  organizationId: string,
  subjectId: string
): Promise<SubjectInteractionRecord[]> {
  const { data, error } = await supabase
    .from('fall_retrieval_traces')
    .select('id, request_id, user_id, organization_id, subject_id, query_text, query_hash, results_count, trace, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('fall_retrieval_traces') || error.code === '42P01' || error.code === '42703') {
      return [];
    }
    throw error;
  }
  return ((data || []) as SubjectInteractionRecord[]).filter((row) => {
    const trace = row.trace || {};
    return row.subject_id === subjectId ||
      trace.subject_id === subjectId ||
      trace.subjectId === subjectId;
  });
}

async function fetchSubjectConsentRecords(
  supabase: Supabase,
  organizationId: string,
  subjectId: string
): Promise<Array<{ id: string }>> {
  const { data, error } = await supabase
    .from('consent_records')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('subject_id', subjectId)
    .limit(5000);
  if (error) throw error;
  return (data || []) as Array<{ id: string }>;
}

async function deleteRowsByIds(
  supabase: Supabase,
  table: string,
  organizationId: string,
  ids: string[]
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('organization_id', organizationId)
    .in('id', ids);
  if (error) throw error;
}

async function processExportJob(
  supabase: Supabase,
  store: DsrObjectStore,
  job: DsrJobRow
): Promise<{ archive: DsrArchive; downloadUrl: string }> {
  const memories = await fetchSubjectMemories(supabase, job.organization_id, job.subject_id);
  const memoryIds = memories.map((memory) => memory.id);
  const [auditLogs, interactions] = await Promise.all([
    fetchSubjectAuditLogs(supabase, job.organization_id, job.subject_id, memoryIds),
    fetchSubjectInteractions(supabase, job.organization_id, job.subject_id),
  ]);
  const archive = buildDsrArchive({
    organizationId: job.organization_id,
    subjectId: job.subject_id,
    memories,
    auditLogs,
    interactions,
  });
  const key = `dsr-exports/${job.organization_id}/${job.id}.json`;
  await store.putJson(key, archive);
  const downloadUrl = await store.createSignedGetUrl(key, EXPORT_TTL_SECONDS);
  return { archive, downloadUrl };
}

async function processDeleteJob(
  supabase: Supabase,
  job: DsrJobRow
): Promise<{ certificate: DeletionCertificate; certificateHash: string; tombstoneId: string | null; rowsDeleted: Record<string, number> }> {
  const [memories, interactions, consents] = await Promise.all([
    fetchSubjectMemories(supabase, job.organization_id, job.subject_id),
    fetchSubjectInteractions(supabase, job.organization_id, job.subject_id),
    fetchSubjectConsentRecords(supabase, job.organization_id, job.subject_id),
  ]);
  const memoryIds = memories.map((memory) => memory.id);
  const auditLogs = await fetchSubjectAuditLogs(supabase, job.organization_id, job.subject_id, memoryIds);
  const auditIds = auditLogs.map((audit) => audit.id);
  const interactionIds = interactions.map((interaction) => interaction.id);
  const consentIds = consents.map((consent) => consent.id);
  const preDeleteHashes = Object.fromEntries(
    memories.map((memory) => [
      memory.id,
      sha256(
        canonicalizeForCompliance({
          content: memory.content ?? null,
          encrypted_content: memory.encrypted_content ?? null,
          deleted_at: memory.deleted_at ?? null,
        })
      ),
    ])
  );

  await deleteRowsByIds(supabase, 'memories', job.organization_id, memoryIds);
  await deleteRowsByIds(supabase, 'consent_records', job.organization_id, consentIds);
  await deleteRowsByIds(supabase, 'audit_logs', job.organization_id, auditIds);
  await deleteRowsByIds(supabase, 'fall_retrieval_traces', job.organization_id, interactionIds);

  const deletedAt = new Date().toISOString();
  const certificate = buildDeletionCertificate({
    jobId: job.id,
    organizationId: job.organization_id,
    subjectId: job.subject_id,
    reason: job.reason || 'DSR delete request',
    requestedBy: job.requested_by || 'system',
    deletedAt,
    memoryIds,
    interactionCount: interactions.length,
    preDeleteHashes,
  });
  const rowsDeleted = {
    memories: memoryIds.length,
    consent_records: consentIds.length,
    audit_logs: auditIds.length,
    fall_retrieval_traces: interactionIds.length,
  };
  const certificateHash = sha256(canonicalizeForCompliance(certificate));
  const { data, error } = await supabase
    .from('dsr_deletion_tombstones')
    .insert({
      job_id: job.id,
      subject_id: job.subject_id,
      organization_id: job.organization_id,
      deleted_at: deletedAt,
      certificate_hash: certificateHash,
      rows_deleted: rowsDeleted,
    })
    .select('id')
    .single();
  if (error) throw error;

  return {
    certificate,
    certificateHash,
    tombstoneId: typeof data?.id === 'string' ? data.id : null,
    rowsDeleted,
  };
}

export async function processNextDsrJob(
  supabase: Supabase,
  store: DsrObjectStore
): Promise<DsrWorkerResult> {
  let job = await claimNextDsrJob(supabase);
  if (!job) {
    return { processed: false };
  }
  job = { ...job, status: 'processing' };
  await logDsrTransition(job, 'dsr.processing');

  try {
    if (job.type === 'export') {
      const { archive, downloadUrl } = await processExportJob(supabase, store, job);
      const completed = await updateJob(supabase, job, {
        status: 'completed',
        artifact_url: downloadUrl,
        artifact: {
          storage_key: `dsr-exports/${job.organization_id}/${job.id}.json`,
          counts: archive.counts,
        },
        completed_at: archive.generated_at,
        error_message: null,
      });
      await logDsrTransition(completed, 'dsr.completed', {
        download_url: downloadUrl,
        counts: archive.counts,
      });
      return {
        processed: true,
        jobId: job.id,
        jobType: job.type,
        status: 'completed',
        downloadUrl,
      };
    }

    const deletion = await processDeleteJob(supabase, job);
    const completed = await updateJob(supabase, job, {
      status: 'completed',
      certificate: deletion.certificate,
      completed_at: deletion.certificate.deleted_at,
      error_message: null,
    });
    await logDsrTransition(completed, 'dsr.completed', {
      certificate_hash: deletion.certificateHash,
      rows_deleted: deletion.rowsDeleted,
      tombstone_id: deletion.tombstoneId,
    });
    return {
      processed: true,
      jobId: job.id,
      jobType: job.type,
      status: 'completed',
      tombstoneId: deletion.tombstoneId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown DSR worker error';
    const failed = await updateJob(supabase, job, {
      status: 'failed',
      error_message: message,
    });
    await logDsrTransition(failed, 'dsr.failed', { error: message });
    throw error;
  }
}
