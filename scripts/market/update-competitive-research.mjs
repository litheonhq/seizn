#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const sourcePath = path.join(__dirname, "competitive-sources.json");
const outputPath = path.join(repoRoot, "docs", "research", "competitive-positioning.md");

const POSITIONING_ROWS = [
  ["Persistent memory + profile graph", "Native", "Integrated", "Custom Build", "Custom Build"],
  ["Policy engine + tenant governance", "Native", "Partial", "Custom Build", "Partial"],
  ["Trace + eval + replay in one flow", "Native", "Partial", "Custom Build", "Integrated"],
  ["Autopilot webhook + regression actions", "Native", "Partial", "Custom Build", "Partial"],
  ["E2E encrypted confidential memories", "Native", "Partial", "Custom Build", "Custom Build"],
  ["Enterprise SSO (SAML/OIDC)", "Native", "Partial", "Custom Build", "Partial"],
  ["On-prem / controlled deployment", "Integrated", "Partial", "Integrated", "Partial"],
  ["Audit evidence + SLA alignment", "Native", "Partial", "Custom Build", "Partial"],
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

async function checkUrl(url) {
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { "user-agent": "seizn-competitive-refresh/1.0" },
    });

    if (headResponse.status >= 400 || headResponse.status === 405) {
      const getResponse = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "user-agent": "seizn-competitive-refresh/1.0" },
      });
      return {
        ok: getResponse.ok,
        status: getResponse.status,
        finalUrl: getResponse.url || url,
      };
    }

    return {
      ok: headResponse.ok,
      status: headResponse.status,
      finalUrl: headResponse.url || url,
    };
  } catch (error) {
    return {
      ok: false,
      status: "error",
      finalUrl: url,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function run() {
  const sourceRaw = await fs.readFile(sourcePath, "utf8");
  const sourceData = JSON.parse(sourceRaw);
  const sources = Array.isArray(sourceData.sources) ? sourceData.sources : [];

  if (sources.length === 0) {
    throw new Error("No competitive sources found in competitive-sources.json");
  }

  const checked = await Promise.all(
    sources.map(async (source) => {
      const result = await checkUrl(source.url);
      return {
        vendor: source.vendor,
        scope: source.scope,
        url: source.url,
        status: result.status,
        health: result.ok ? "OK" : "Needs review",
        finalUrl: result.finalUrl,
        error: result.error || "",
      };
    })
  );

  const generatedDate = todayIsoDate();
  const markdown = [
    "# Competitive Positioning Research",
    "",
    `Last refreshed: ${generatedDate}`,
    "",
    "This is a category-based positioning sheet (not a direct numeric price benchmark).",
    "",
    "## Positioning Matrix",
    "",
    "| Capability Category | Seizn | Memory APIs | Vector DB + Custom Stack | Observability Tools |",
    "| --- | --- | --- | --- | --- |",
    ...POSITIONING_ROWS.map(
      (row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} |`
    ),
    "",
    "## Source Health Check",
    "",
    "| Vendor | Scope | Status | Health | Source URL |",
    "| --- | --- | --- | --- | --- |",
    ...checked.map(
      (item) =>
        `| ${item.vendor} | ${item.scope} | ${item.status} | ${item.health} | ${item.finalUrl} |`
    ),
    "",
    "## Notes",
    "",
    "- Use this report for positioning and qualification. Confirm final fit with product trial and compliance review.",
    "- If a source is marked `Needs review`, refresh manually and validate content changes before sales usage.",
    "",
  ].join("\n");

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, markdown, "utf8");

  const failedChecks = checked.filter((item) => item.health !== "OK");
  if (failedChecks.length > 0) {
    console.warn(
      `[competitive-research] Generated with ${failedChecks.length} source(s) requiring review.`
    );
  } else {
    console.log("[competitive-research] All source checks passed.");
  }
  console.log(`[competitive-research] Updated ${path.relative(repoRoot, outputPath)}`);
}

run().catch((error) => {
  console.error("[competitive-research] Failed:", error);
  process.exit(1);
});
