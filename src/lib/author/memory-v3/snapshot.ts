import {
  AUTHOR_MEMORY_V3_SCHEMA_VERSION,
  type AuthorCanonStatus,
  type AuthorMemoryRecord,
  type AuthorMemorySnapshot,
} from './types';
import { sha256Hex } from './canonical';

const NON_CURRENT_STATUSES = new Set<AuthorCanonStatus>([
  'candidate',
  'rejected',
  'retired',
  'contradicted',
  'invalidated',
  'past_only',
]);

export interface CreateAuthorMemorySnapshotInput {
  projectId?: string;
  records: AuthorMemoryRecord[];
  generatedAt?: string;
}

export interface CurrentCanonOptions {
  asOf?: string;
}

export function createAuthorMemorySnapshot(
  input: CreateAuthorMemorySnapshotInput
): AuthorMemorySnapshot {
  const records = sortRecords(input.records).map(normalizeRecord);
  const recordHashes = Object.fromEntries(
    records.map((record) => [record.id, sha256Hex(record)])
  );
  const hashPayload = {
    schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
    projectId: input.projectId,
    records,
  };

  return {
    schemaVersion: AUTHOR_MEMORY_V3_SCHEMA_VERSION,
    projectId: input.projectId,
    snapshotHash: sha256Hex(hashPayload),
    itemCount: records.length,
    recordHashes,
    records,
    generatedAt: input.generatedAt,
  };
}

export function filterCurrentCanonRecords(
  records: AuthorMemoryRecord[],
  options: CurrentCanonOptions = {}
): AuthorMemoryRecord[] {
  const asOfTime = options.asOf ? Date.parse(options.asOf) : undefined;

  return sortRecords(records)
    .map(normalizeRecord)
    .filter((record) => {
      if (NON_CURRENT_STATUSES.has(record.status)) {
        return false;
      }

      if (record.status !== 'canon') {
        return false;
      }

      if (asOfTime !== undefined) {
        if (record.validAt && Date.parse(record.validAt) > asOfTime) {
          return false;
        }

        if (record.invalidAt && Date.parse(record.invalidAt) <= asOfTime) {
          return false;
        }
      } else if (record.invalidAt) {
        return false;
      }

      return true;
    });
}

function sortRecords(records: AuthorMemoryRecord[]): AuthorMemoryRecord[] {
  return [...records].sort((a, b) => {
    const byKind = a.kind.localeCompare(b.kind);
    if (byKind !== 0) {
      return byKind;
    }

    return a.id.localeCompare(b.id);
  });
}

function normalizeRecord(record: AuthorMemoryRecord): AuthorMemoryRecord {
  return {
    ...record,
    entityIds: record.entityIds ? [...record.entityIds].sort() : undefined,
  };
}
