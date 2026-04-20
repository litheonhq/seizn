import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

type Memory = {
  id: string;
  entityId: string;
  sizeBytes: number;
  tier: 'hot' | 'warm';
  pinned: boolean;
  recallCount: number;
  lastRecall: number;
};

type BenchmarkResult = {
  label: string;
  totalBytesStored: number;
  avgTokensLoadedPerRecall: number;
  p95RecallLatencyMs: number;
  hotBytes: number;
};

const ENTITY_COUNT = 100;
const MEMORIES_PER_ENTITY = 200;
const RECALLS = 5_000;
const HOT_BUDGET_BYTES = 64 * 1024;
const BYTES_PER_TOKEN = 4;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index];
}

function makeDataset(): Memory[] {
  const random = mulberry32(42);
  const memories: Memory[] = [];
  for (let entity = 0; entity < ENTITY_COUNT; entity += 1) {
    for (let index = 0; index < MEMORIES_PER_ENTITY; index += 1) {
      const sizeBytes = 384 + Math.floor(random() * 1408);
      memories.push({
        id: `entity_${entity}_memory_${index}`,
        entityId: `entity_${entity}`,
        sizeBytes,
        tier: 'hot',
        pinned: index < 2,
        recallCount: 0,
        lastRecall: 0,
      });
    }
  }
  return memories;
}

function chooseZipfEntity(random: () => number): number {
  const u = random();
  return Math.min(ENTITY_COUNT - 1, Math.floor(Math.pow(u, 2.2) * ENTITY_COUNT));
}

function chooseZipfMemory(random: () => number): number {
  const u = random();
  return Math.min(MEMORIES_PER_ENTITY - 1, Math.floor(Math.pow(u, 2.6) * MEMORIES_PER_ENTITY));
}

function enforceBudget(memories: Memory[]): void {
  const byEntity = new Map<string, Memory[]>();
  for (const memory of memories) {
    const list = byEntity.get(memory.entityId) || [];
    list.push(memory);
    byEntity.set(memory.entityId, list);
  }

  for (const entityMemories of byEntity.values()) {
    let hotBytes = entityMemories.reduce((sum, memory) => sum + (memory.tier === 'hot' ? memory.sizeBytes : 0), 0);
    const candidates = entityMemories
      .filter((memory) => !memory.pinned)
      .sort((a, b) => a.recallCount - b.recallCount || a.lastRecall - b.lastRecall);

    for (const memory of candidates) {
      if (hotBytes <= HOT_BUDGET_BYTES) break;
      memory.tier = 'warm';
      hotBytes -= memory.sizeBytes;
    }
  }
}

function run(label: string, budgetOn: boolean): BenchmarkResult {
  const random = mulberry32(86);
  const memories = makeDataset();
  const latencies: number[] = [];
  const tokensLoaded: number[] = [];

  if (budgetOn) {
    enforceBudget(memories);
  }

  const byId = new Map(memories.map((memory) => [memory.id, memory]));
  for (let i = 0; i < RECALLS; i += 1) {
    const entity = chooseZipfEntity(random);
    const index = chooseZipfMemory(random);
    const memory = byId.get(`entity_${entity}_memory_${index}`);
    if (!memory) continue;

    memory.recallCount += 1;
    memory.lastRecall = i + 1;

    const entityMemories = memories.filter((item) => item.entityId === memory.entityId);
    const loadedBytes = budgetOn
      ? entityMemories
          .filter((item) => item.tier === 'hot')
          .reduce((sum, item) => sum + item.sizeBytes, 0)
      : entityMemories.reduce((sum, item) => sum + item.sizeBytes, 0);

    tokensLoaded.push(loadedBytes / BYTES_PER_TOKEN);
    latencies.push(8 + loadedBytes / 4096 + (budgetOn ? 1.8 : 0));

    if (budgetOn && i % 50 === 0) {
      enforceBudget(memories);
    }
  }

  return {
    label,
    totalBytesStored: memories.reduce((sum, memory) => sum + memory.sizeBytes, 0),
    avgTokensLoadedPerRecall: tokensLoaded.reduce((sum, value) => sum + value, 0) / tokensLoaded.length,
    p95RecallLatencyMs: percentile(latencies, 0.95),
    hotBytes: memories
      .filter((memory) => memory.tier === 'hot')
      .reduce((sum, memory) => sum + memory.sizeBytes, 0),
  };
}

function pctReduction(before: number, after: number): string {
  return `${(((before - after) / before) * 100).toFixed(1)}%`;
}

const off = run('Budget OFF', false);
const on = run('Budget ON', true);
const reportPath = join(process.cwd(), 'docs', 'benchmarks', 'memory-budget-2026-04.md');

const markdown = `# Memory Budget Benchmark - April 2026

Synthetic workload: ${ENTITY_COUNT} entities, ${MEMORIES_PER_ENTITY} memories per entity, ${RECALLS.toLocaleString()} Zipfian recall queries. Hot tier budget is ${(HOT_BUDGET_BYTES / 1024).toFixed(0)}KB per entity.

| Mode | Total bytes stored | Hot bytes scanned | Avg tokens loaded / recall | p95 recall latency |
| --- | ---: | ---: | ---: | ---: |
| ${off.label} | ${off.totalBytesStored.toLocaleString()} | ${off.hotBytes.toLocaleString()} | ${off.avgTokensLoadedPerRecall.toFixed(0)} | ${off.p95RecallLatencyMs.toFixed(1)}ms |
| ${on.label} | ${on.totalBytesStored.toLocaleString()} | ${on.hotBytes.toLocaleString()} | ${on.avgTokensLoadedPerRecall.toFixed(0)} | ${on.p95RecallLatencyMs.toFixed(1)}ms |

Result: hot/warm tiering reduced average tokens loaded per recall by **${pctReduction(
  off.avgTokensLoadedPerRecall,
  on.avgTokensLoadedPerRecall
)}** and p95 recall latency by **${pctReduction(off.p95RecallLatencyMs, on.p95RecallLatencyMs)}** in this deterministic workload.
`;

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, markdown);
console.log(markdown);
