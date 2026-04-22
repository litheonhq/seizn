import type { createServerClient } from '@/lib/supabase';
import { ComplianceError, normalizeAgeBracket, type AgeBracket } from './age-gate';

type Supabase = ReturnType<typeof createServerClient>;

export type ConsentScope = 'memory_storage' | 'ai_training' | 'analytics' | string;

export interface ScopedConsentRecord {
  id: string;
  organization_id: string;
  subject_id: string;
  bracket: AgeBracket;
  scopes: string[];
  policy_version: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export class ConsentRequiredError extends ComplianceError {
  constructor(scope: string) {
    super(
      'compliance/consent_required',
      `Consent is required before using subject data for ${scope}.`,
      403
    );
    this.name = 'ConsentRequiredError';
  }
}

function normalizeSubjectId(subjectId: string): string {
  const trimmed = subjectId.trim();
  if (!trimmed || trimmed.length > 256) {
    throw new ComplianceError(
      'compliance/invalid_subject',
      'subjectId must be 1-256 characters.',
      400
    );
  }
  return trimmed;
}

function normalizeScopes(scopes: string[]): string[] {
  return [...new Set(
    scopes
      .map((scope) => scope.trim())
      .filter((scope) => /^[a-z][a-z0-9_:-]{1,63}$/.test(scope))
  )].sort();
}

function mapConsentRecord(row: Record<string, unknown>): ScopedConsentRecord {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    subject_id: String(row.subject_id),
    bracket: normalizeAgeBracket(row.bracket),
    scopes: Array.isArray(row.scopes) ? row.scopes.map(String) : [],
    policy_version:
      typeof row.policy_version === 'string' ? row.policy_version : '2026-04-01',
    granted_at:
      typeof row.granted_at === 'string' ? row.granted_at : new Date().toISOString(),
    expires_at: typeof row.expires_at === 'string' ? row.expires_at : null,
    revoked_at: typeof row.revoked_at === 'string' ? row.revoked_at : null,
  };
}

export function requiresConsent(scope: ConsentScope, ageBracket: AgeBracket): boolean {
  if (scope === 'ai_training') return true;
  if (scope === 'memory_storage') return ageBracket === 'minor_under_13';
  if (scope === 'analytics') return ageBracket === 'minor_under_13';
  return ageBracket === 'minor_under_13';
}

export async function recordConsent(
  supabase: Supabase,
  params: {
    organizationId: string;
    subjectId: string;
    ageBracket: AgeBracket;
    scopes: string[];
    version: string;
    parentProof?: string | null;
    expiresAt?: string | null;
  }
): Promise<ScopedConsentRecord> {
  const scopes = normalizeScopes(params.scopes);
  if (scopes.length === 0) {
    throw new ComplianceError('compliance/invalid_scope', 'At least one consent scope is required.', 400);
  }

  const payload = {
    organization_id: params.organizationId,
    subject_id: normalizeSubjectId(params.subjectId),
    bracket: params.ageBracket,
    scopes,
    policy_version: params.version || '2026-04-01',
    parent_proof: params.parentProof || null,
    granted_at: new Date().toISOString(),
    expires_at: params.expiresAt || null,
    revoked_at: null,
  };

  const { data, error } = await supabase
    .from('consent_records')
    .upsert(payload, { onConflict: 'organization_id,subject_id,bracket' })
    .select('id, organization_id, subject_id, bracket, scopes, policy_version, granted_at, expires_at, revoked_at')
    .single();
  if (error) throw error;
  return mapConsentRecord(data as Record<string, unknown>);
}

export async function getActiveConsent(
  supabase: Supabase,
  params: {
    organizationId: string;
    subjectId: string;
    asOf?: Date;
  }
): Promise<ScopedConsentRecord | null> {
  const asOf = params.asOf ?? new Date();
  const { data, error } = await supabase
    .from('consent_records')
    .select('id, organization_id, subject_id, bracket, scopes, policy_version, granted_at, expires_at, revoked_at')
    .eq('organization_id', params.organizationId)
    .eq('subject_id', normalizeSubjectId(params.subjectId))
    .is('revoked_at', null)
    .lte('granted_at', asOf.toISOString())
    .order('granted_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const record = Array.isArray(data) && data[0] ? mapConsentRecord(data[0] as Record<string, unknown>) : null;
  if (!record) return null;
  if (record.expires_at && new Date(record.expires_at) <= asOf) return null;
  return record;
}

export async function assertConsent(
  supabase: Supabase,
  params: {
    organizationId: string | null;
    subjectId: string | null;
    scope: ConsentScope;
    ageBracket: AgeBracket;
  }
): Promise<void> {
  if (!requiresConsent(params.scope, params.ageBracket)) return;
  if (!params.organizationId || !params.subjectId) {
    throw new ConsentRequiredError(params.scope);
  }
  const record = await getActiveConsent(supabase, {
    organizationId: params.organizationId,
    subjectId: params.subjectId,
  });
  if (!record || !record.scopes.includes(params.scope)) {
    throw new ConsentRequiredError(params.scope);
  }
}

export async function revokeConsentScope(
  supabase: Supabase,
  params: {
    organizationId: string;
    subjectId: string;
    scope: string;
  }
): Promise<{ revoked: boolean; revokedAt: string }> {
  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('consent_records')
    .update({ revoked_at: revokedAt })
    .eq('organization_id', params.organizationId)
    .eq('subject_id', normalizeSubjectId(params.subjectId))
    .is('revoked_at', null)
    .contains('scopes', [params.scope])
    .select('id')
    .limit(1);
  if (error) throw error;
  return { revoked: Array.isArray(data) && data.length > 0, revokedAt };
}
