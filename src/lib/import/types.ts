export type CompetitorImportSource = "inworld" | "convai" | "rivet";

export type ImportStatus = "previewed" | "committed" | "rolled_back" | "failed";

export type ImportCanonScope = "never_say" | "always_say" | "must_not_know" | "must_know";

export type ImportBeliefSourceType = "direct" | "told" | "inferred" | "rumor";

export interface NormalizedImportMemory {
  externalId: string;
  content: string;
  npcId: string | null;
  memoryType: string;
  namespace: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface NormalizedImportCanonLock {
  externalId: string;
  npcId: string | null;
  scope: ImportCanonScope;
  statement: string;
  severity: "hard" | "soft";
  metadata: Record<string, unknown>;
}

export interface NormalizedImportBelief {
  externalId: string;
  holderEntityId: string;
  content: string;
  sourceType: ImportBeliefSourceType;
  confidence: number;
  observedAt: string | null;
  metadata: Record<string, unknown>;
}

export interface NormalizedImportBundle {
  source: CompetitorImportSource;
  title: string;
  memories: NormalizedImportMemory[];
  canonLocks: NormalizedImportCanonLock[];
  beliefs: NormalizedImportBelief[];
  warnings: string[];
  rawStats: Record<string, number>;
}

export interface ImportPreviewSummary {
  memories: number;
  canonLocks: number;
  beliefs: number;
  totalEntities: number;
  warnings: number;
}

export interface ImportJobView {
  id: string;
  source: CompetitorImportSource;
  status: ImportStatus;
  filename: string | null;
  summary: ImportPreviewSummary;
  createdAt: string;
  committedAt: string | null;
  rolledBackAt: string | null;
  insertedMemoryIds: string[];
  insertedCanonLockIds: string[];
  insertedBeliefIds: string[];
}
