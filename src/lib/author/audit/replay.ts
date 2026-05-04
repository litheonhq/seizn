import { sha256Hex } from '@/lib/author/memory-v3/canonical';
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
  const replayStatus = warnings.length > 0 ? 'drift_risk' : 'deterministic';

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
  };
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
