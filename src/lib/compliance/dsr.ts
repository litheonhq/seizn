import crypto from 'crypto';
import type { createServerClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/audit/logger';
import { logTamperEvidentEvent, sha256 } from '@/lib/audit/tamper-evident';
import { listOrganizationUserIds } from './organization';

type Supabase = ReturnType<typeof createServerClient>;

export type DsrJobType = 'export' | 'delete';
export type DsrJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ComplianceActor {
  userId: string;
  keyId?: string | null;
  organizationId: string;
}

export interface SubjectMemoryRecord {
  id: string;
  user_id?: string | null;
  organization_id?: string | null;
  subject_id?: string | null;
  content?: string | null;
  encrypted_content?: string | null;
  is_encrypted?: boolean | null;
  memory_type?: string | null;
  tags?: string[] | null;
  namespace?: string | null;
  scope?: string | null;
  session_id?: string | null;
  agent_id?: string | null;
  source?: string | null;
  importance?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
  is_deleted?: boolean | null;
}

export interface SubjectAuditRecord {
  id: string;
  user_id?: string | null;
  organization_id?: string | null;
  api_key_id?: string | null;
  action?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: Record<string, unknown> | null;
  status?: string | null;
  created_at?: string | null;
}

export interface SubjectInteractionRecord {
  id: string;
  request_id?: string | null;
  user_id?: string | null;
  organization_id?: string | null;
  subject_id?: string | null;
  query_text?: string | null;
  query_hash?: string | null;
  results_count?: number | null;
  trace?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface DsrArchive {
  schema: 'seizn.dsr.archive.v1';
  subject_id: string;
  organization_id: string;
  generated_at: string;
  counts: {
    memories: number;
    audit_logs: number;
    interactions: number;
  };
  memories: SubjectMemoryRecord[];
  audit_logs: SubjectAuditRecord[];
  interactions: SubjectInteractionRecord[];
}

export interface DeletionCertificate {
  schema: 'seizn.dsr.deletion_certificate.v1';
  job_id: string;
  organization_id: string;
  subject_id: string;
  reason: string;
  requested_by: string;
  deleted_at: string;
  affected: {
    memories: number;
    interactions: number;
  };
  memory_ids: string[];
  pre_delete_hashes: Record<string, string>;
  content_zeroed: boolean;
  signature: string;
}

export interface AuditQueryFilters {
  organizationId: string;
  from?: Date;
  to?: Date;
  eventType?: string;
  actor?: string;
  subjectId?: string;
  limit?: number;
  offset?: number;
}

const ZEROED_CIPHERTEXT = '0'.repeat(128);

function signingSecret(): string {
  return (
    process.env.SEIZN_COMPLIANCE_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SEIZN_OWNER_KEY ||
    'seizn-compliance-dev-secret'
  );
}

export function canonicalizeForCompliance(value: unknown): string {
  return JSON.stringify(sortForCanonicalJson(value));
}

function sortForCanonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForCanonicalJson);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortForCanonicalJson(nested)])
  );
}

export function signCompliancePayload(payload: unknown, secret = signingSecret()): string {
  return crypto
    .createHmac('sha256', secret)
    .update(canonicalizeForCompliance(payload), 'utf8')
    .digest('hex');
}

export function verifyComplianceSignature(
  payload: unknown,
  signature: string,
  secret = signingSecret()
): boolean {
  const expected = signCompliancePayload(payload, secret);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function buildSignedArtifactUrl(params: {
  jobId: string;
  expiresAt: Date;
  basePath?: string;
}): string {
  const path = params.basePath ?? `/api/v1/dsr/jobs/${params.jobId}`;
  const payload = {
    path,
    download: 'artifact',
    expires: params.expiresAt.toISOString(),
  };
  const signature = signCompliancePayload(payload);
  const search = new URLSearchParams({
    download: 'artifact',
    expires: params.expiresAt.toISOString(),
    sig: signature,
  });
  return `${path}?${search.toString()}`;
}

export function buildDsrArchive(params: {
  organizationId: string;
  subjectId: string;
  generatedAt?: string;
  memories: SubjectMemoryRecord[];
  auditLogs: SubjectAuditRecord[];
  interactions: SubjectInteractionRecord[];
}): DsrArchive {
  return {
    schema: 'seizn.dsr.archive.v1',
    subject_id: params.subjectId,
    organization_id: params.organizationId,
    generated_at: params.generatedAt ?? new Date().toISOString(),
    counts: {
      memories: params.memories.length,
      audit_logs: params.auditLogs.length,
      interactions: params.interactions.length,
    },
    memories: params.memories,
    audit_logs: params.auditLogs,
    interactions: params.interactions,
  };
}

export function buildDeletionCertificate(params: {
  jobId: string;
  organizationId: string;
  subjectId: string;
  reason: string;
  requestedBy: string;
  deletedAt: string;
  memoryIds: string[];
  interactionCount: number;
  preDeleteHashes: Record<string, string>;
}): DeletionCertificate {
  const unsigned = {
    schema: 'seizn.dsr.deletion_certificate.v1',
    job_id: params.jobId,
    organization_id: params.organizationId,
    subject_id: params.subjectId,
    reason: params.reason,
    requested_by: params.requestedBy,
    deleted_at: params.deletedAt,
    affected: {
      memories: params.memoryIds.length,
      interactions: params.interactionCount,
    },
    memory_ids: params.memoryIds,
    pre_delete_hashes: params.preDeleteHashes,
    content_zeroed: true,
  } satisfies Omit<DeletionCertificate, 'signature'>;

  return {
    ...unsigned,
    signature: signCompliancePayload(unsigned),
  };
}

function validateSubjectId(subjectId: string): string {
  const trimmed = subjectId.trim();
  if (!trimmed || trimmed.length > 256) {
    throw new Error('subject_id must be 1-256 characters');
  }
  return trimmed;
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
  if (details.subject_id === subjectId) return true;
  if (details.subjectId === subjectId) return true;
  return row.resource_id ? memoryIds.has(row.resource_id) : false;
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

function traceMatchesSubject(row: SubjectInteractionRecord, subjectId: string): boolean {
  if (row.subject_id === subjectId) return true;
  const trace = row.trace || {};
  return trace.subject_id === subjectId || trace.subjectId === subjectId;
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

  return ((data || []) as SubjectInteractionRecord[]).filter((row) =>
    traceMatchesSubject(row, subjectId)
  );
}

async function insertDsrJob(
  supabase: Supabase,
  params: {
    id: string;
    actor: ComplianceActor;
    type: DsrJobType;
    subjectId: string;
    status: DsrJobStatus;
    reason?: string | null;
    artifactUrl?: string | null;
    artifact?: unknown;
    certificate?: unknown;
    errorMessage?: string | null;
    completedAt?: string | null;
  }
): Promise<void> {
  const { error } = await supabase.from('dsr_jobs').insert({
    id: params.id,
    organization_id: params.actor.organizationId,
    requested_by: params.actor.userId,
    api_key_id: params.actor.keyId || null,
    type: params.type,
    subject_id: params.subjectId,
    status: params.status,
    reason: params.reason || null,
    artifact_url: params.artifactUrl || null,
    artifact: params.artifact || null,
    certificate: params.certificate || null,
    error_message: params.errorMessage || null,
    completed_at: params.completedAt || null,
  });

  if (error) throw error;
}

export async function createDsrExport(
  supabase: Supabase,
  params: {
    actor: ComplianceActor;
    subjectId: string;
  }
): Promise<{
  jobId: string;
  status: DsrJobStatus;
  artifactUrl: string;
  webhookUrl: string;
  archive: DsrArchive;
}> {
  const subjectId = validateSubjectId(params.subjectId);
  const memories = await fetchSubjectMemories(supabase, params.actor.organizationId, subjectId);
  const memoryIds = memories.map((memory) => memory.id);
  const [auditLogs, interactions] = await Promise.all([
    fetchSubjectAuditLogs(supabase, params.actor.organizationId, subjectId, memoryIds),
    fetchSubjectInteractions(supabase, params.actor.organizationId, subjectId),
  ]);

  const archive = buildDsrArchive({
    organizationId: params.actor.organizationId,
    subjectId,
    memories,
    auditLogs,
    interactions,
  });
  const jobId = crypto.randomUUID();
  const artifactUrl = buildSignedArtifactUrl({
    jobId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });

  await insertDsrJob(supabase, {
    id: jobId,
    actor: params.actor,
    type: 'export',
    subjectId,
    status: 'completed',
    artifactUrl,
    artifact: archive,
    completedAt: archive.generated_at,
  });

  await logAuditEvent(
    {
      userId: params.actor.userId,
      apiKeyId: params.actor.keyId || undefined,
      isServiceRole: true,
    },
    {
      action: 'dsr.exported',
      resourceType: 'dsr_job',
      resourceId: jobId,
      teamId: params.actor.organizationId,
      details: {
        subject_id: subjectId,
        memory_count: archive.counts.memories,
        audit_log_count: archive.counts.audit_logs,
        interaction_count: archive.counts.interactions,
      },
    }
  );

  return {
    jobId,
    status: 'completed',
    artifactUrl,
    webhookUrl: `/api/v1/dsr/jobs/${jobId}`,
    archive,
  };
}

export async function createDsrDeletion(
  supabase: Supabase,
  params: {
    actor: ComplianceActor;
    subjectId: string;
    reason: string;
  }
): Promise<{
  jobId: string;
  status: DsrJobStatus;
  certificate: DeletionCertificate;
}> {
  const subjectId = validateSubjectId(params.subjectId);
  const reason = params.reason.trim();
  if (!reason) throw new Error('reason is required');

  const memories = await fetchSubjectMemories(supabase, params.actor.organizationId, subjectId);
  const interactions = await fetchSubjectInteractions(
    supabase,
    params.actor.organizationId,
    subjectId
  );
  const memoryIds = memories.map((memory) => memory.id);
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

  if (memoryIds.length > 0) {
    const { error } = await supabase
      .from('memories')
      .update({
        content: '[deleted-by-dsr]',
        encrypted_content: ZEROED_CIPHERTEXT,
        embedding: null,
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('organization_id', params.actor.organizationId)
      .eq('subject_id', subjectId)
      .in('id', memoryIds);

    if (error) throw error;
  }

  const jobId = crypto.randomUUID();
  const deletedAt = new Date().toISOString();
  const certificate = buildDeletionCertificate({
    jobId,
    organizationId: params.actor.organizationId,
    subjectId,
    reason,
    requestedBy: params.actor.userId,
    deletedAt,
    memoryIds,
    interactionCount: interactions.length,
    preDeleteHashes,
  });

  await insertDsrJob(supabase, {
    id: jobId,
    actor: params.actor,
    type: 'delete',
    subjectId,
    status: 'completed',
    reason,
    certificate,
    completedAt: deletedAt,
  });

  await logAuditEvent(
    {
      userId: params.actor.userId,
      apiKeyId: params.actor.keyId || undefined,
      isServiceRole: true,
    },
    {
      action: 'dsr.deleted',
      resourceType: 'dsr_job',
      resourceId: jobId,
      teamId: params.actor.organizationId,
      details: {
        subject_id: subjectId,
        reason,
        memory_count: memoryIds.length,
        certificate_signature: certificate.signature,
      },
    }
  );

  await logTamperEvidentEvent({
    organization_id: params.actor.organizationId,
    user_id: params.actor.userId,
    action: 'dsr.deleted',
    resource_type: 'dsr_job',
    resource_id: jobId,
    details: {
      subject_id: subjectId,
      reason,
      certificate_signature: certificate.signature,
      memory_count: memoryIds.length,
    },
    status: 'success',
  });

  return {
    jobId,
    status: 'completed',
    certificate,
  };
}

export async function getDsrJob(
  supabase: Supabase,
  params: { organizationId: string; jobId: string }
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('dsr_jobs')
    .select('id, organization_id, type, subject_id, status, reason, artifact_url, artifact, certificate, error_message, created_at, completed_at')
    .eq('organization_id', params.organizationId)
    .eq('id', params.jobId)
    .maybeSingle();

  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

export function verifyArtifactDownload(params: {
  path: string;
  expires: string | null;
  signature: string | null;
  now?: Date;
}): boolean {
  if (!params.expires || !params.signature) return false;
  const expiresAt = new Date(params.expires);
  if (!Number.isFinite(expiresAt.getTime())) return false;
  if (expiresAt <= (params.now ?? new Date())) return false;

  return verifyComplianceSignature(
    {
      path: params.path,
      download: 'artifact',
      expires: params.expires,
    },
    params.signature
  );
}

export async function queryAuditLogs(
  supabase: Supabase,
  filters: AuditQueryFilters
): Promise<{ logs: SubjectAuditRecord[]; total: number; limit: number; offset: number }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabase
    .from('audit_logs')
    .select('id, user_id, organization_id, api_key_id, action, resource_type, resource_id, details, status, created_at', { count: 'exact' })
    .eq('organization_id', filters.organizationId)
    .order('created_at', { ascending: false });

  if (filters.eventType) query = query.eq('action', filters.eventType);
  if (filters.actor) query = query.eq('user_id', filters.actor);
  if (filters.from) query = query.gte('created_at', filters.from.toISOString());
  if (filters.to) query = query.lte('created_at', filters.to.toISOString());

  const { data, error, count } = await query.range(offset, offset + limit - 1);
  if (error) throw error;

  const logs = ((data || []) as SubjectAuditRecord[]).filter((row) => {
    if (!filters.subjectId) return true;
    const details = row.details || {};
    return details.subject_id === filters.subjectId || details.subjectId === filters.subjectId;
  });

  return { logs, total: count ?? logs.length, limit, offset };
}

function csvCell(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatAuditExport(
  logs: SubjectAuditRecord[],
  format: 'jsonl' | 'csv'
): string {
  if (format === 'jsonl') {
    return logs.map((log) => JSON.stringify(sortForCanonicalJson(log))).join('\n');
  }

  const header = ['id', 'created_at', 'action', 'resource_type', 'resource_id', 'user_id', 'status', 'details'];
  const rows = logs.map((log) => [
    log.id,
    log.created_at,
    log.action,
    log.resource_type,
    log.resource_id,
    log.user_id,
    log.status,
    log.details,
  ].map(csvCell).join(','));
  return [header.join(','), ...rows].join('\n');
}

export async function exportAuditLogs(
  supabase: Supabase,
  filters: AuditQueryFilters & { format: 'jsonl' | 'csv' }
): Promise<{
  artifactUrl: string;
  content: string;
  format: 'jsonl' | 'csv';
  count: number;
}> {
  const result = await queryAuditLogs(supabase, { ...filters, limit: 5000, offset: 0 });
  const content = formatAuditExport(result.logs, filters.format);
  const digest = sha256(content);
  const artifactUrl = buildSignedArtifactUrl({
    jobId: `audit-${digest.slice(0, 20)}`,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    basePath: '/api/v1/audit/export',
  });

  await logAuditEvent(
    {
      userId: filters.actor || 'system',
      isServiceRole: true,
    },
    {
      action: 'audit.exported',
      resourceType: 'audit_log',
      teamId: filters.organizationId,
      details: {
        format: filters.format,
        count: result.logs.length,
        digest,
        subject_id: filters.subjectId || null,
      },
    }
  );

  return {
    artifactUrl,
    content,
    format: filters.format,
    count: result.logs.length,
  };
}

export async function buildOrganizationComplianceStatus(
  supabase: Supabase,
  organizationId: string
): Promise<{
  pendingJobs: number;
  completedJobs: number;
  consentRecords: number;
  subjectMemories: number;
}> {
  const [jobs, consents, memories] = await Promise.all([
    supabase
      .from('dsr_jobs')
      .select('status', { count: 'exact' })
      .eq('organization_id', organizationId)
      .limit(200),
    supabase
      .from('consent_records')
      .select('id', { count: 'exact' })
      .eq('organization_id', organizationId)
      .limit(1),
    supabase
      .from('memories')
      .select('id', { count: 'exact' })
      .eq('organization_id', organizationId)
      .not('subject_id', 'is', null)
      .eq('is_deleted', false)
      .limit(1),
  ]);

  const jobRows = Array.isArray(jobs.data) ? (jobs.data as Array<{ status?: string }>) : [];
  return {
    pendingJobs: jobRows.filter((job) => job.status === 'pending' || job.status === 'running').length,
    completedJobs: jobRows.filter((job) => job.status === 'completed').length,
    consentRecords: consents.count ?? 0,
    subjectMemories: memories.count ?? 0,
  };
}

export async function listRecentDsrJobs(
  supabase: Supabase,
  organizationId: string,
  limit = 25
): Promise<Array<{
  id: string;
  type: DsrJobType;
  subject_id: string;
  status: DsrJobStatus;
  artifact_url?: string | null;
  certificate?: Record<string, unknown> | null;
  created_at: string;
  completed_at?: string | null;
}>> {
  const { data, error } = await supabase
    .from('dsr_jobs')
    .select('id, type, subject_id, status, artifact_url, certificate, created_at, completed_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data || []) as Array<{
    id: string;
    type: DsrJobType;
    subject_id: string;
    status: DsrJobStatus;
    artifact_url?: string | null;
    certificate?: Record<string, unknown> | null;
    created_at: string;
    completed_at?: string | null;
  }>;
}

export async function getOrganizationSubjectCoverage(
  supabase: Supabase,
  organizationId: string
): Promise<{ userIds: string[]; hasOrganizationScope: boolean }> {
  const userIds = await listOrganizationUserIds(supabase, organizationId);
  return {
    userIds,
    hasOrganizationScope: userIds.length > 0,
  };
}
