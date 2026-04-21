import type { NormalizedImportBundle, NormalizedImportCanonLock, NormalizedImportMemory } from "./types";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function splitBackstory(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 12);
}

export function parseConvaiExport(raw: unknown): NormalizedImportBundle {
  const root = asRecord(raw);
  if (!root) throw new Error("convai_export_must_be_object");

  const character = asRecord(root.character) || asRecord(root.agent) || root;
  const title = cleanText(character.name) || cleanText(root.name) || "Convai import";
  const npcId = cleanText(character.id) || cleanText(character.name) || cleanText(root.character_id) || title;
  const backstory = cleanText(character.backstory) || cleanText(root.backstory) || cleanText(character.bio);
  const tagline = cleanText(character.tagline) || cleanText(root.tagline) || cleanText(character.greeting);
  const warnings: string[] = [];
  const memories: NormalizedImportMemory[] = [];
  const canonLocks: NormalizedImportCanonLock[] = [];

  if (backstory) {
    splitBackstory(backstory).forEach((content, index) => {
      memories.push({
        externalId: `convai-backstory-${index + 1}`,
        content,
        npcId,
        memoryType: "fact",
        namespace: "import/convai",
        tags: ["import", "convai", "backstory"],
        metadata: { source: "convai", mapping: "backstory_to_memory" },
      });
    });
  } else {
    warnings.push("No Convai backstory field was detected.");
  }

  if (tagline) {
    canonLocks.push({
      externalId: "convai-tagline",
      npcId,
      scope: "always_say",
      statement: tagline,
      severity: "soft",
      metadata: { source: "convai", mapping: "tagline_to_always_say" },
    });
  } else {
    warnings.push("No Convai tagline or greeting was detected for the always_say lock.");
  }

  return {
    source: "convai",
    title,
    memories,
    canonLocks,
    beliefs: [],
    warnings,
    rawStats: {
      backstoryMemories: memories.length,
      taglineLocks: canonLocks.length,
    },
  };
}
