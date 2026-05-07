import { sha256Hex } from '@/lib/author/memory-v3/canonical';
import { computeAuthorAuditEntryHash } from './logger';
import type {
  AuthorAuditLogEntry,
  AuthorAuditLogStore,
  AuthorAuditReplayResult,
} from './types';

export async function replayAuthorAuditDecision(
  store: AuthorAuditLogStore,
  input: {
    projectId: string;
    decisionId: string;
  }
): Promise<AuthorAuditReplayResult> {
  const entries = await store.search({ projectId: input.projectId, limit: 500 });
  return replayAuthorAuditChain(entries, input.decisionId);
}

export function replayAuthorAuditChain(
  entries: AuthorAuditLogEntry[],
  decisionId: string,
  replayedAt = new Date().toISOString()
): AuthorAuditReplayResult {
  const start = entries.find((entry) => entry.decisionId === decisionId);
  if (!start) {
    return {
      decisionId,
      replayStatus: 'not_found',
      chain: [],
      chainLength: 0,
      replayedAt,
      warnings: [`decision_not_found:${decisionId}`],
    };
  }

  const chain = collectDecisionChain(entries, decisionId);
  const warnings = auditReplayWarnings(chain);

  // Hash verification (Phase 3 critical fix 2026-05-07): pre-fix the chain
  // claimed "hash-chained" semantics but never recomputed any hash.
  // Anyone with service-role could edit a stored row and replay returned
  // 'deterministic' cleanly. Now we walk the chain and recompute each
  // entry_hash from its canonical fields; mismatch → 'tampered'.
  const hashVerification = verifyChainHashes(chain, entries, warnings);
  const replayStatus: AuthorAuditReplayResult['replayStatus'] =
    hashVerification.tampered > 0 || hashVerification.chainBroken > 0
      ? 'tampered'
      : warnings.length > 0
        ? 'drift_risk'
        : 'deterministic';

  return {
    decisionId,
    replayStatus,
    chain,
    chainLength: chain.length,
    startCreatedAt: start.createdAt,
    replayedAt,
    payloadHash: sha256Hex(chain.map((entry) => ({
      eventType: entry.eventType,
      payload: entry.payload,
      sourceSpan: entry.sourceSpan ?? null,
    }))),
    llmMetaHash: sha256Hex(chain.map((entry) => entry.llmMeta ?? null)),
    warnings,
    hashVerification,
  };
}

function verifyChainHashes(
  chain: AuthorAuditLogEntry[],
  allEntries: AuthorAuditLogEntry[],
  warnings: string[],
): NonNullable<AuthorAuditReplayResult['hashVerification']> {
  let verified = 0;
  let tampered = 0;
  let grandfathered = 0;
  let chainBroken = 0;

  // Index parents by decision_id once for O(1) lookup.
  const byDecisionId = new Map<string, AuthorAuditLogEntry>();
  for (const e of allEntries) byDecisionId.set(e.decisionId, e);

  for (const entry of chain) {
    if (!entry.entryHash) {
      // Pre-migration row — no stored hash to verify against. Count as
      // "grandfathered" (legitimate gap in coverage) but flag in the
      // warnings list so an operator can see the boundary.
      grandfathered += 1;
      warnings.push(`grandfathered_no_hash:${entry.decisionId}`);
      continue;
    }

    // Resolve the parent's stored entry_hash (or null for roots).
    const expectedPreviousHash = entry.parentDecisionId
      ? (byDecisionId.get(entry.parentDecisionId)?.entryHash ?? null)
      : null;

    if (entry.previousHash !== expectedPreviousHash) {
      // The chain link is broken — either parent's stored hash differs from
      // what this entry's previous_hash points to (someone edited the
      // parent), or the parent isn't in the loaded chain.
      chainBroken += 1;
      warnings.push(`chain_broken:${entry.decisionId}`);
      continue;
    }

    const recomputed = computeAuthorAuditEntryHash({
      previousHash: entry.previousHash ?? null,
      projectId: entry.projectId,
      userId: entry.userId,
      eventType: entry.eventType,
      payload: entry.payload,
      llmMeta: entry.llmMeta ?? null,
      sourceSpan: entry.sourceSpan ?? null,
      decisionId: entry.decisionId,
      parentDecisionId: entry.parentDecisionId ?? null,
      createdAt: entry.createdAt,
    });

    if (recomputed !== entry.entryHash) {
      tampered += 1;
      warnings.push(`hash_mismatch:${entry.decisionId}`);
    } else {
      verified += 1;
    }
  }

  return { verified, tampered, grandfathered, chainBroken };
}

function collectDecisionChain(entries: AuthorAuditLogEntry[], decisionId: string): AuthorAuditLogEntry[] {
  const byParent = new Map<string, AuthorAuditLogEntry[]>();
  for (const entry of entries) {
    if (!entry.parentDecisionId) continue;
    const children = byParent.get(entry.parentDecisionId) ?? [];
    children.push(entry);
    byParent.set(entry.parentDecisionId, children);
  }

  const output: AuthorAuditLogEntry[] = [];
  const queue = entries
    .filter((entry) => entry.decisionId === decisionId)
    .sort(sortAuditEntriesAsc);
  const seen = new Set<string>();

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry || seen.has(entry.decisionId)) continue;
    seen.add(entry.decisionId);
    output.push(entry);
    queue.push(...(byParent.get(entry.decisionId) ?? []).sort(sortAuditEntriesAsc));
  }

  return output.sort(sortAuditEntriesAsc);
}

function auditReplayWarnings(chain: AuthorAuditLogEntry[]): string[] {
  const warnings: string[] = [];
  for (const entry of chain) {
    const payload = entry.payload;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const record = payload as Record<string, unknown>;
      if (record.deterministic === false) warnings.push(`non_deterministic:${entry.decisionId}`);
      if (record.replay_status === 'drift') warnings.push(`drift:${entry.decisionId}`);
    }
    if (entry.eventType.includes('simulation') && !entry.llmMeta?.prompt_hash) {
      warnings.push(`missing_prompt_hash:${entry.decisionId}`);
    }
  }
  return [...new Set(warnings)];
}

function sortAuditEntriesAsc(a: AuthorAuditLogEntry, b: AuthorAuditLogEntry): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}
