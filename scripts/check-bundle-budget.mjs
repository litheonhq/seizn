#!/usr/bin/env node
/**
 * Fails CI when the static JS/CSS report grows beyond agreed guardrails.
 * Generate the report first with `npm run analyze`.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const reportPath = path.join(process.cwd(), ".next", "analyze", "static-bundle-report.json");

const budget = {
  totalBytes: readKbBudget("SEIZN_BUNDLE_TOTAL_KB", 8050) * 1024,
  totalGzipBytes: readKbBudget("SEIZN_BUNDLE_TOTAL_GZIP_KB", 2400) * 1024,
  maxFileBytes: readKbBudget("SEIZN_BUNDLE_MAX_FILE_KB", 550) * 1024,
  maxFileGzipBytes: readKbBudget("SEIZN_BUNDLE_MAX_FILE_GZIP_KB", 170) * 1024,
};

if (!fs.existsSync(reportPath)) {
  console.error(`Bundle report not found: ${normalizePath(path.relative(process.cwd(), reportPath))}`);
  console.error("Run `npm run analyze` before `npm run check:bundle-budget`.");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (!report.totals || !Array.isArray(report.files)) {
  console.error("Invalid static bundle report shape.");
  process.exit(1);
}

const largestRaw = maxBy(report.files, (file) => file.bytes);
const largestGzip = maxBy(report.files, (file) => file.gzipBytes);
const failures = [
  check("total JS/CSS", report.totals.bytes, budget.totalBytes),
  check("total JS/CSS gzip", report.totals.gzipBytes, budget.totalGzipBytes),
  check(`largest JS/CSS file (${largestRaw.path})`, largestRaw.bytes, budget.maxFileBytes),
  check(`largest JS/CSS gzip file (${largestGzip.path})`, largestGzip.gzipBytes, budget.maxFileGzipBytes),
].filter(Boolean);

if (failures.length > 0) {
  console.error("Bundle budget failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  printTopFiles(report.files);
  process.exit(1);
}

console.log("Bundle budget passed.");
console.log(`Total JS/CSS: ${formatBytes(report.totals.bytes)} (${formatBytes(report.totals.gzipBytes)} gzip)`);
console.log(`Largest JS/CSS: ${largestRaw.path} ${formatBytes(largestRaw.bytes)}`);
console.log(`Largest gzip: ${largestGzip.path} ${formatBytes(largestGzip.gzipBytes)}`);

function readKbBudget(name, fallbackKb) {
  const rawValue = process.env[name];
  if (rawValue == null || rawValue === "") return fallbackKb;

  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`Invalid ${name}: ${rawValue}`);
    process.exit(1);
  }

  return value;
}

function check(label, actual, allowed) {
  if (actual <= allowed) return null;
  return `${label} is ${formatBytes(actual)}; budget is ${formatBytes(allowed)}`;
}

function maxBy(values, readValue) {
  return values.reduce((best, current) => (
    readValue(current) > readValue(best) ? current : best
  ), values[0]);
}

function printTopFiles(files) {
  console.error("Top JS/CSS files:");
  for (const file of files.slice(0, 10)) {
    console.error(`- ${file.path}: ${formatBytes(file.bytes)} (${formatBytes(file.gzipBytes)} gzip)`);
  }
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
