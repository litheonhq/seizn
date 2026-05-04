type JsonRecord = Record<string, unknown>;

export const CONFLICT_DECISIONS = [
  'keep_existing',
  'replace_with_new',
  'defer_both',
  'custom',
] as const;

export type ConflictDecision = typeof CONFLICT_DECISIONS[number];

export interface ConflictPayload {
  text?: string;
  edits?: JsonRecord;
}

export type ConflictResolutionInput = ConflictPayload & {
  decision: ConflictDecision;
};

export function isConflictDecision(value: unknown): value is ConflictDecision {
  return typeof value === 'string' && CONFLICT_DECISIONS.includes(value as ConflictDecision);
}

export function normalizeConflictResolution(input: JsonRecord): ConflictResolutionInput | null {
  const decision = input.decision;
  if (!isConflictDecision(decision)) return null;

  if (decision !== 'custom') {
    return { decision };
  }

  const text = typeof input.text === 'string' && input.text.trim() ? input.text.trim() : undefined;
  const edits = isJsonRecord(input.edits) ? input.edits : undefined;
  return {
    decision,
    ...(text ? { text } : {}),
    ...(edits ? { edits } : {}),
  };
}

export function conflictStatusForDecision(decision: ConflictDecision): 'resolved' | 'deferred' {
  return decision === 'defer_both' ? 'deferred' : 'resolved';
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
