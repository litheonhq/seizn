import type { NormalizedImportBundle, NormalizedImportCanonLock, NormalizedImportMemory } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function textFromEntry(entry: unknown): string | null {
  const direct = cleanText(entry);
  if (direct) return direct;
  const record = asRecord(entry);
  if (!record) return null;
  return (
    cleanText(record.text) ||
    cleanText(record.content) ||
    cleanText(record.value) ||
    cleanText(record.description) ||
    cleanText(record.statement)
  );
}

function idFromEntry(entry: unknown, fallback: string): string {
  const record = asRecord(entry);
  return (
    cleanText(record?.id) ||
    cleanText(record?.key) ||
    cleanText(record?.name) ||
    cleanText(record?.title) ||
    fallback
  );
}

function splitKnowledgeBlock(value: unknown): string[] {
  const text = cleanText(value);
  if (!text) return [];
  return text
    .split(/\r?\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function collectCharacterRecords(root: JsonRecord): Array<{ npcId: string | null; record: JsonRecord }> {
  const candidates = [
    ...asArray(root.characters),
    ...asArray(root.agents),
    ...asArray(root.scenes),
    ...asArray(root.entities),
  ];

  return candidates
    .map((candidate) => {
      const record = asRecord(candidate);
      if (!record) return null;
      const npcId = cleanText(record.id) || cleanText(record.name) || cleanText(record.characterId) || null;
      return { npcId, record };
    })
    .filter((item): item is { npcId: string | null; record: JsonRecord } => Boolean(item));
}

function collectKnowledge(root: JsonRecord): Array<{ npcId: string | null; entry: unknown }> {
  const entries: Array<{ npcId: string | null; entry: unknown }> = [];
  for (const key of ["knowledge", "knowledgeRecords", "facts", "memories"]) {
    for (const entry of asArray(root[key])) entries.push({ npcId: null, entry });
    for (const line of splitKnowledgeBlock(root[key])) entries.push({ npcId: null, entry: line });
  }

  for (const { npcId, record } of collectCharacterRecords(root)) {
    for (const key of ["knowledge", "knowledgeRecords", "facts", "memories"]) {
      for (const entry of asArray(record[key])) entries.push({ npcId, entry });
      for (const line of splitKnowledgeBlock(record[key])) entries.push({ npcId, entry: line });
    }
  }

  return entries;
}

function collectGoals(root: JsonRecord): Array<{ npcId: string | null; entry: unknown }> {
  const entries: Array<{ npcId: string | null; entry: unknown }> = [];
  for (const key of ["goals", "instructions", "objectives"]) {
    for (const entry of asArray(root[key])) entries.push({ npcId: null, entry });
    for (const line of splitKnowledgeBlock(root[key])) entries.push({ npcId: null, entry: line });
  }

  for (const { npcId, record } of collectCharacterRecords(root)) {
    for (const key of ["goals", "instructions", "objectives"]) {
      for (const entry of asArray(record[key])) entries.push({ npcId, entry });
      for (const line of splitKnowledgeBlock(record[key])) entries.push({ npcId, entry: line });
    }
  }

  return entries;
}

export function parseInworldExport(raw: unknown): NormalizedImportBundle {
  const root = asRecord(raw);
  if (!root) throw new Error("inworld_export_must_be_object");

  const title = cleanText(root.name) || cleanText(root.title) || "Inworld import";
  const warnings: string[] = [];
  const memories: NormalizedImportMemory[] = [];
  const canonLocks: NormalizedImportCanonLock[] = [];

  collectKnowledge(root).forEach(({ npcId, entry }, index) => {
    const content = textFromEntry(entry);
    if (!content) {
      warnings.push(`Skipped empty Inworld knowledge entry ${index + 1}`);
      return;
    }
    memories.push({
      externalId: `inworld-knowledge-${idFromEntry(entry, String(index + 1))}`,
      content,
      npcId,
      memoryType: "fact",
      namespace: "import/inworld",
      tags: ["import", "inworld", "knowledge"],
      metadata: { source: "inworld", mapping: "knowledge_to_memory" },
    });
  });

  collectGoals(root).forEach(({ npcId, entry }, index) => {
    const statement = textFromEntry(entry);
    if (!statement) {
      warnings.push(`Skipped empty Inworld goal entry ${index + 1}`);
      return;
    }
    canonLocks.push({
      externalId: `inworld-goal-${idFromEntry(entry, String(index + 1))}`,
      npcId,
      scope: "must_know",
      statement,
      severity: "hard",
      metadata: { source: "inworld", mapping: "goal_to_must_know" },
    });
  });

  if (memories.length === 0 && canonLocks.length === 0) {
    warnings.push("No Inworld knowledge or goals were detected.");
  }

  return {
    source: "inworld",
    title,
    memories,
    canonLocks,
    beliefs: [],
    warnings,
    rawStats: {
      knowledgeEntries: memories.length,
      goalEntries: canonLocks.length,
    },
  };
}
