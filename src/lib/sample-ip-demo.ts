import { readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";

const SAMPLE_IP_DIR = path.join(process.cwd(), "docs", "marketing", "sample_ip");

export type SaebyeokSourceStatus =
  | { file: string; ok: true }
  | { file: string; ok: false; error: string };

export interface SaebyeokDemoData {
  readme: {
    title: string;
    body: string;
    metadata: Record<string, unknown>;
  };
  canon: Record<string, unknown>;
  worldRules: Record<string, unknown>;
  timeline: Record<string, unknown>;
  relationships: Record<string, unknown>;
  reviewCases: Record<string, unknown>;
  simulations: Record<string, unknown>;
  summary: {
    characters: number;
    worldRules: number;
    timelineEvents: number;
    relationships: number;
    reviewCases: number;
    simulations: number;
  };
  sourceStatus: SaebyeokSourceStatus[];
  hasSourceErrors: boolean;
}

export const SAEBYEOK_SOURCE_FILES = [
  "saebyeok-readme.md",
  "saebyeok_canon_v1.json",
  "saebyeok_world_rules_v1.json",
  "saebyeok_timeline_v1.json",
  "saebyeok_relationships_v1.json",
  "saebyeok_review_cases_v1.json",
  "saebyeok_simulation_cases_v1.json",
] as const;

export async function loadSaebyeokDemoData(options: { sourceDir?: string } = {}): Promise<SaebyeokDemoData> {
  const sourceDir = options.sourceDir ?? SAMPLE_IP_DIR;
  const [
    readmeResult,
    canonResult,
    worldRulesResult,
    timelineResult,
    relationshipsResult,
    reviewCasesResult,
    simulationsResult,
  ] = await Promise.all([
    readTextSource("saebyeok-readme.md", sourceDir),
    readJsonSource("saebyeok_canon_v1.json", sourceDir),
    readJsonSource("saebyeok_world_rules_v1.json", sourceDir),
    readJsonSource("saebyeok_timeline_v1.json", sourceDir),
    readJsonSource("saebyeok_relationships_v1.json", sourceDir),
    readJsonSource("saebyeok_review_cases_v1.json", sourceDir),
    readJsonSource("saebyeok_simulation_cases_v1.json", sourceDir),
  ]);
  const readmeSource = readmeResult.ok ? readmeResult.value : "# Saebyeok Academy\n\nSample data temporarily unavailable.";
  const parsedReadme = matter(readmeSource);
  const canon = jsonValue(canonResult);
  const worldRules = jsonValue(worldRulesResult);
  const timeline = jsonValue(timelineResult);
  const relationships = jsonValue(relationshipsResult);
  const reviewCases = jsonValue(reviewCasesResult);
  const simulations = jsonValue(simulationsResult);
  const sourceStatus = [
    statusOnly(readmeResult),
    statusOnly(canonResult),
    statusOnly(worldRulesResult),
    statusOnly(timelineResult),
    statusOnly(relationshipsResult),
    statusOnly(reviewCasesResult),
    statusOnly(simulationsResult),
  ];

  return {
    readme: {
      title: extractMarkdownTitle(parsedReadme.content) ?? "Saebyeok Academy",
      body: parsedReadme.content,
      metadata: parsedReadme.data,
    },
    canon,
    worldRules,
    timeline,
    relationships,
    reviewCases,
    simulations,
    summary: {
      characters: getArray(canon, "characters").length,
      worldRules: getArray(worldRules, "rules").length,
      timelineEvents: getArray(timeline, "events").length,
      relationships: getArray(relationships, "relationships").length,
      reviewCases: getArray(reviewCases, "cases").length,
      simulations: getArray(simulations, "simulations").length,
    },
    sourceStatus,
    hasSourceErrors: sourceStatus.some((status) => !status.ok),
  };
}

export function getArray<T = Record<string, unknown>>(source: Record<string, unknown>, key: string): T[] {
  const value = source[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

export function getString(source: unknown, key: string, fallback = ""): string {
  if (!source || typeof source !== "object") return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : fallback;
}

export function getNumber(source: unknown, key: string, fallback = 0): number {
  if (!source || typeof source !== "object") return fallback;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "number" ? value : fallback;
}

export function getNestedString(source: unknown, pathSegments: string[], fallback = ""): string {
  let current = source;
  for (const segment of pathSegments) {
    if (!current || typeof current !== "object") return fallback;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : fallback;
}

type SourceResult<T> =
  | { file: string; ok: true; value: T }
  | { file: string; ok: false; error: string };

async function readTextSource(filename: string, sourceDir: string): Promise<SourceResult<string>> {
  try {
    return {
      file: filename,
      ok: true,
      value: await readFile(path.join(sourceDir, filename), "utf8"),
    };
  } catch (error) {
    return {
      file: filename,
      ok: false,
      error: formatSourceError(error),
    };
  }
}

async function readJsonSource(filename: string, sourceDir: string): Promise<SourceResult<Record<string, unknown>>> {
  const source = await readTextSource(filename, sourceDir);
  if (!source.ok) return source;

  try {
    return {
      file: filename,
      ok: true,
      value: JSON.parse(source.value) as Record<string, unknown>,
    };
  } catch (error) {
    return {
      file: filename,
      ok: false,
      error: formatSourceError(error),
    };
  }
}

function statusOnly<T>(result: SourceResult<T>): SaebyeokSourceStatus {
  return result.ok
    ? { file: result.file, ok: true }
    : { file: result.file, ok: false, error: result.error };
}

function jsonValue(result: SourceResult<Record<string, unknown>>): Record<string, unknown> {
  return result.ok ? result.value : {};
}

function formatSourceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function extractMarkdownTitle(markdown: string): string | null {
  const line = markdown.split(/\r?\n/).find((value) => value.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : null;
}
