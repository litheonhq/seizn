import { readFile } from "fs/promises";
import path from "path";
import matter from "gray-matter";

const SAMPLE_IP_DIR = path.join(process.cwd(), "docs", "marketing", "sample_ip");

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

export async function loadSaebyeokDemoData(): Promise<SaebyeokDemoData> {
  const [
    readmeSource,
    canon,
    worldRules,
    timeline,
    relationships,
    reviewCases,
    simulations,
  ] = await Promise.all([
    readText("saebyeok-readme.md"),
    readJson("saebyeok_canon_v1.json"),
    readJson("saebyeok_world_rules_v1.json"),
    readJson("saebyeok_timeline_v1.json"),
    readJson("saebyeok_relationships_v1.json"),
    readJson("saebyeok_review_cases_v1.json"),
    readJson("saebyeok_simulation_cases_v1.json"),
  ]);
  const parsedReadme = matter(readmeSource);

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

async function readText(filename: string): Promise<string> {
  return readFile(path.join(SAMPLE_IP_DIR, filename), "utf8");
}

async function readJson(filename: string): Promise<Record<string, unknown>> {
  const source = await readText(filename);
  return JSON.parse(source) as Record<string, unknown>;
}

function extractMarkdownTitle(markdown: string): string | null {
  const line = markdown.split(/\r?\n/).find((value) => value.startsWith("# "));
  return line ? line.replace(/^#\s+/, "").trim() : null;
}
