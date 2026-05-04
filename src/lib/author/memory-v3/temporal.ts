import type { AuthorCanonStatus, AuthorMemoryRecord } from './types';
import { filterCurrentCanonRecords } from './snapshot';

export type AuthorCanonDecision =
  | 'included'
  | 'excluded_status'
  | 'excluded_future'
  | 'excluded_invalidated'
  | 'excluded_non_canon';

export interface AuthorCanonExplanation {
  recordId: string;
  decision: AuthorCanonDecision;
  included: boolean;
  reasons: string[];
  invalidatedById?: string;
  supersededById?: string;
}

const NON_CANON_STATUSES = new Set<AuthorCanonStatus>([
  'candidate',
  'rejected',
  'retired',
  'contradicted',
  'invalidated',
]);

export function explainAuthorCanonRecord(
  record: AuthorMemoryRecord,
  records: AuthorMemoryRecord[] = [],
  options: { asOf?: string } = {}
): AuthorCanonExplanation {
  const asOfTime = options.asOf ? Date.parse(options.asOf) : undefined;
  const invalidator = records.find((candidate) => candidate.invalidatesId === record.id);
  const superseder = records.find((candidate) => candidate.supersedesId === record.id);

  if (record.status !== 'canon') {
    const decision = record.status === 'past_only' ? 'excluded_non_canon' : 'excluded_status';
    return {
      recordId: record.id,
      decision,
      included: false,
      reasons: [`status is ${record.status}`],
      invalidatedById: invalidator?.id,
      supersededById: superseder?.id,
    };
  }

  if (asOfTime !== undefined && record.validAt && Date.parse(record.validAt) > asOfTime) {
    return {
      recordId: record.id,
      decision: 'excluded_future',
      included: false,
      reasons: [`valid after query time: ${record.validAt}`],
      invalidatedById: invalidator?.id,
      supersededById: superseder?.id,
    };
  }

  if (record.invalidAt && (asOfTime === undefined || Date.parse(record.invalidAt) <= asOfTime)) {
    return {
      recordId: record.id,
      decision: 'excluded_invalidated',
      included: false,
      reasons: [`invalid at ${record.invalidAt}`],
      invalidatedById: invalidator?.id,
      supersededById: superseder?.id,
    };
  }

  return {
    recordId: record.id,
    decision: 'included',
    included: true,
    reasons: ['record is canon and temporally valid'],
    invalidatedById: invalidator?.id,
    supersededById: superseder?.id,
  };
}

export function explainAuthorCanonSet(
  records: AuthorMemoryRecord[],
  options: { asOf?: string } = {}
): AuthorCanonExplanation[] {
  return [...records]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((record) => explainAuthorCanonRecord(record, records, options));
}

export function filterAuthorCanonAsOf(
  records: AuthorMemoryRecord[],
  options: { asOf?: string; includePastOnly?: boolean } = {}
): AuthorMemoryRecord[] {
  if (!options.asOf) {
    const current = filterCurrentCanonRecords(records);
    if (!options.includePastOnly) {
      return current;
    }

    return [
      ...current,
      ...records.filter((record) => record.status === 'past_only'),
    ].sort((a, b) => a.id.localeCompare(b.id));
  }

  const asOfTime = Date.parse(options.asOf);

  return [...records]
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((record) => {
      if (NON_CANON_STATUSES.has(record.status)) {
        return false;
      }

      if (record.status === 'past_only' && !options.includePastOnly) {
        return false;
      }

      if (record.validAt && Date.parse(record.validAt) > asOfTime) {
        return false;
      }

      if (record.invalidAt && Date.parse(record.invalidAt) <= asOfTime) {
        return false;
      }

      return record.status === 'canon' || record.status === 'past_only';
    });
}
