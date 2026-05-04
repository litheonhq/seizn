#!/usr/bin/env node
/**
 * Cross-platform bundle analysis.
 *
 * Default mode uses the normal Turbopack production build and writes a static
 * JS/CSS size report from `.next/static`. Set `SEIZN_ANALYZE_MODE=webpack` to
 * force the heavier `@next/bundle-analyzer` webpack report.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import zlib from "node:zlib";

const mode = process.env.SEIZN_ANALYZE_MODE ?? "static";
const node = process.execPath;
const nextCli = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

if (!["static", "webpack"].includes(mode)) {
  console.error(`Unsupported SEIZN_ANALYZE_MODE: ${mode}`);
  process.exit(1);
}

const routeCheck = spawnSync(node, ["scripts/check-route-conflicts.js"], {
  stdio: "inherit",
  env: process.env,
});
if (routeCheck.status !== 0) {
  process.exit(routeCheck.status ?? 1);
}

if (mode === "webpack") {
  process.env.ANALYZE = "true";
  // Webpack build + bundle analyzer can exceed Node's default heap on this repo.
  // Keep this local to the analyze command to avoid changing normal builds.
  if (!process.env.NODE_OPTIONS?.includes("--max-old-space-size")) {
    const heapMb = process.env.SEIZN_ANALYZE_HEAP_MB ?? "16384";
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=${heapMb}`.trim();
  }

  const build = runNextBuild(["build", "--webpack"]);
  process.exit(build.status ?? 1);
}

process.env.ANALYZE = "false";
const build = runNextBuild(["build"]);
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

writeStaticBundleReport();

function runNextBuild(args) {
  const result = spawnSync(node, [nextCli, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) {
    console.error(result.error);
  }
  return result;
}

function writeStaticBundleReport() {
  const staticDir = path.join(process.cwd(), ".next", "static");
  const outputDir = path.join(process.cwd(), ".next", "analyze");
  const jsonPath = path.join(outputDir, "static-bundle-report.json");
  const mdPath = path.join(outputDir, "static-bundle-report.md");

  if (!fs.existsSync(staticDir)) {
    console.error(`Static build output not found: ${staticDir}`);
    process.exit(1);
  }

  const files = collectFiles(staticDir)
    .filter((file) => [".js", ".css"].includes(path.extname(file)))
    .map((file) => {
      const buffer = fs.readFileSync(file);
      const relativePath = normalizePath(path.relative(staticDir, file));
      return {
        path: relativePath,
        bytes: buffer.length,
        gzipBytes: zlib.gzipSync(buffer).length,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);

  const totals = files.reduce(
    (acc, file) => ({
      bytes: acc.bytes + file.bytes,
      gzipBytes: acc.gzipBytes + file.gzipBytes,
    }),
    { bytes: 0, gzipBytes: 0 }
  );

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        mode: "static",
        generatedAt: new Date().toISOString(),
        staticDir: normalizePath(path.relative(process.cwd(), staticDir)),
        totals,
        files,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  fs.writeFileSync(mdPath, renderMarkdownReport(files, totals), "utf8");

  console.log(`Bundle size report written: ${normalizePath(path.relative(process.cwd(), jsonPath))}`);
  console.log(`Bundle size summary written: ${normalizePath(path.relative(process.cwd(), mdPath))}`);
  console.log(`Total JS/CSS: ${formatBytes(totals.bytes)} (${formatBytes(totals.gzipBytes)} gzip)`);
}

function collectFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(fullPath);
    }
    return entry.isFile() ? [fullPath] : [];
  });
}

function renderMarkdownReport(files, totals) {
  const topFiles = files.slice(0, 30);
  const lines = [
    "# Static Bundle Size Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Total JS/CSS: ${formatBytes(totals.bytes)} (${formatBytes(totals.gzipBytes)} gzip)`,
    "",
    "| File | Size | Gzip |",
    "| --- | ---: | ---: |",
    ...topFiles.map((file) => (
      `| \`${file.path}\` | ${formatBytes(file.bytes)} | ${formatBytes(file.gzipBytes)} |`
    )),
    "",
  ];

  return `${lines.join("\n")}\n`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}
