import type { createServerClient } from '@/lib/supabase';

export const AGE_BRACKETS = ['unknown', 'minor_under_13', 'minor_13_17', 'adult'] as const;

export type AgeBracket = (typeof AGE_BRACKETS)[number];

export interface RetentionPolicy {
  bracket: AgeBracket;
  maxRetentionDays: number | null;
  allowVoicePrint: boolean;
  allowProfiling: boolean;
  requireConsentRecord: boolean;
}

export interface ConsentRecord {
  id?: string;
  organization_id?: string;
  subject_id: string;
  bracket: AgeBracket;
  parent_proof?: string | null;
  granted_at: string;
  expires_at?: string | null;
  revoked_at?: string | null;
}

export class ComplianceError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 403) {
    super(message);
    this.name = 'ComplianceError';
    this.code = code;
    this.status = status;
  }
}

export function normalizeAgeBracket(value: unknown): AgeBracket {
  return AGE_BRACKETS.includes(value as AgeBracket) ? (value as AgeBracket) : 'unknown';
}

export function policyFor(bracket: AgeBracket): RetentionPolicy {
  switch (bracket) {
    case 'minor_under_13':
      return {
        bracket,
        maxRetentionDays: 30,
        allowVoicePrint: false,
        allowProfiling: false,
        requireConsentRecord: true,
      };
    case 'minor_13_17':
      return {
        bracket,
        maxRetentionDays: 365,
        allowVoicePrint: false,
        allowProfiling: false,
        requireConsentRecord: false,
      };
    case 'adult':
      return {
        bracket,
        maxRetentionDays: null,
        allowVoicePrint: true,
        allowProfiling: true,
        requireConsentRecord: false,
      };
    case 'unknown':
    default:
      return {
        bracket: 'unknown',
        maxRetentionDays: 90,
        allowVoicePrint: false,
        allowProfiling: false,
        requireConsentRecord: false,
      };
  }
}

export function hasValidConsentRecord(
  records: ConsentRecord[],
  options?: { asOf?: Date; bracket?: AgeBracket }
): boolean {
  const asOf = options?.asOf ?? new Date();
  const bracket = options?.bracket ?? 'minor_under_13';

  return records.some((record) => {
    if (record.bracket !== bracket) return false;
    if (record.revoked_at && new Date(record.revoked_at) <= asOf) return false;
    if (record.granted_at && new Date(record.granted_at) > asOf) return false;
    if (record.expires_at && new Date(record.expires_at) <= asOf) return false;
    return true;
  });
}

export function applyPolicy<T extends { created_at?: string | null }>(
  memory: T,
  policy: RetentionPolicy,
  options?: { asOf?: Date }
): T | null {
  if (policy.maxRetentionDays == null || !memory.created_at) {
    return memory;
  }

  const asOf = options?.asOf ?? new Date();
  const createdAt = new Date(memory.created_at);
  const maxAgeMs = policy.maxRetentionDays * 24 * 60 * 60 * 1000;
  return asOf.getTime() - createdAt.getTime() > maxAgeMs ? null : memory;
}

export async function getActiveConsentRecords(
  supabase: ReturnType<typeof createServerClient>,
  params: {
    organizationId: string;
    subjectId: string;
    bracket?: AgeBracket;
    asOf?: Date;
  }
): Promise<ConsentRecord[]> {
  const asOf = params.asOf ?? new Date();
  let query = supabase
    .from('consent_records')
    .select('id, organization_id, subject_id, bracket, parent_proof, granted_at, expires_at, revoked_at')
    .eq('organization_id', params.organizationId)
    .eq('subject_id', params.subjectId)
    .is('revoked_at', null)
    .lte('granted_at', asOf.toISOString());

  if (params.bracket) {
    query = query.eq('bracket', params.bracket);
  }

  const { data, error } = await query.order('granted_at', { ascending: false }).limit(20);
  if (error) {
    throw new ComplianceError(
      'compliance/consent_lookup_failed',
      'Unable to verify consent record for this subject.',
      500
    );
  }

  return ((data || []) as ConsentRecord[]).filter((record) =>
    hasValidConsentRecord([record], { asOf, bracket: params.bracket ?? record.bracket })
  );
}

export async function assertRetentionAllowed(
  supabase: ReturnType<typeof createServerClient>,
  params: {
    organizationId: string | null;
    subjectId: string | null;
    bracket: AgeBracket;
    asOf?: Date;
  }
): Promise<RetentionPolicy> {
  const policy = policyFor(params.bracket);
  if (!policy.requireConsentRecord) {
    return policy;
  }

  if (!params.organizationId || !params.subjectId) {
    throw new ComplianceError(
      'compliance/coppa_consent_missing',
      'A verifiable parental consent record is required before retaining memory for subjects under 13.'
    );
  }

  const records = await getActiveConsentRecords(supabase, {
    organizationId: params.organizationId,
    subjectId: params.subjectId,
    bracket: params.bracket,
    asOf: params.asOf,
  });

  if (!hasValidConsentRecord(records, { asOf: params.asOf, bracket: params.bracket })) {
    throw new ComplianceError(
      'compliance/coppa_consent_missing',
      'A verifiable parental consent record is required before retaining memory for subjects under 13.'
    );
  }

  return policy;
}
