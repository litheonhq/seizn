import type { NormalizedImportBelief, NormalizedImportBundle } from "./types";

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

function toConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0.82;
  return Math.max(0, Math.min(1, parsed));
}

function graphNodes(root: JsonRecord): unknown[] {
  const graph = asRecord(root.graph);
  return [
    ...asArray(root.nodes),
    ...asArray(graph?.nodes),
    ...asArray(root.graphNodes),
  ];
}

function textFromNode(node: JsonRecord): string | null {
  const data = asRecord(node.data) || {};
  return (
    cleanText(node.memory) ||
    cleanText(node.text) ||
    cleanText(node.content) ||
    cleanText(node.label) ||
    cleanText(data.memory) ||
    cleanText(data.text) ||
    cleanText(data.content) ||
    cleanText(data.label)
  );
}

function holderFromNode(node: JsonRecord, fallback: string): string {
  const data = asRecord(node.data) || {};
  return (
    cleanText(node.holderEntityId) ||
    cleanText(node.holder_entity_id) ||
    cleanText(node.npcId) ||
    cleanText(node.characterId) ||
    cleanText(data.holderEntityId) ||
    cleanText(data.npcId) ||
    cleanText(data.characterId) ||
    cleanText(node.id) ||
    fallback
  );
}

export function parseRivetExport(raw: unknown): NormalizedImportBundle {
  const root = asRecord(raw);
  if (!root) throw new Error("rivet_export_must_be_object");

  const title = cleanText(root.name) || cleanText(root.title) || "Rivet import";
  const warnings: string[] = [];
  const beliefs: NormalizedImportBelief[] = [];

  graphNodes(root).forEach((entry, index) => {
    const node = asRecord(entry);
    if (!node) {
      warnings.push(`Skipped malformed Rivet graph node ${index + 1}`);
      return;
    }
    const content = textFromNode(node);
    if (!content) {
      warnings.push(`Skipped empty Rivet graph node ${index + 1}`);
      return;
    }
    const data = asRecord(node.data) || {};
    beliefs.push({
      externalId: cleanText(node.id) || `rivet-node-${index + 1}`,
      holderEntityId: holderFromNode(node, `rivet-node-${index + 1}`),
      content,
      sourceType: "inferred",
      confidence: toConfidence(node.confidence ?? data.confidence),
      observedAt: cleanText(node.observedAt) || cleanText(node.observed_at) || null,
      metadata: { source: "rivet", mapping: "graph_node_to_belief_shard" },
    });
  });

  if (beliefs.length === 0) {
    warnings.push("No Rivet graph nodes were detected.");
  }

  return {
    source: "rivet",
    title,
    memories: [],
    canonLocks: [],
    beliefs,
    warnings,
    rawStats: {
      graphNodes: beliefs.length,
    },
  };
}
