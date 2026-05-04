#!/usr/bin/env node
/**
 * Keeps the API authorization surface reviewable.
 *
 * This guard does not decide whether a route should be public. It snapshots the
 * current route methods and detected auth markers, then fails when that surface
 * changes without an explicit baseline update.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const apiRoot = path.join(process.cwd(), "src", "app", "api");
const baselinePath = path.join(process.cwd(), "docs", "security", "api-auth-surface.json");
const updateMode = process.argv.includes("--update");

const markerPatterns = [
  ["apiKey", /\b(authenticateRequest|validateApiKey|extractApiKey)\b/],
  ["apiScope", /\b(requireApiScope|hasApiScope)\b/],
  ["scopedPermission", /\b(requireScopedPermission|authenticateScopedRequest)\b/],
  ["sessionUser", /\b(getRequestUser|getSessionUser|getServerSession)\b|\bauth\s*\(/],
  ["scim", /\bauthenticateSCIMRequest\b/],
  ["cronSecret", /\b(CRON_SECRET|cron-auth|verifyCron)\b/],
  ["webhookSignature", /\b(webhook|signature|svix|stripe-signature|x-hub-signature|X-Seizn-Signature)\b/i],
  ["csrf", /\b(csrf|validateCsrf|enforceCsrf)\b/i],
];

if (!fs.existsSync(apiRoot)) {
  console.error(`API root not found: ${normalizePath(path.relative(process.cwd(), apiRoot))}`);
  process.exit(1);
}

const snapshot = {
  version: 1,
  generatedBy: "scripts/verify-api-auth-surface.mjs",
  routeCount: 0,
  routes: collectRouteFiles(apiRoot).map(scanRoute).sort((a, b) => a.route.localeCompare(b.route)),
};
snapshot.routeCount = snapshot.routes.length;

if (updateMode) {
  fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
  fs.writeFileSync(baselinePath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`API auth surface baseline updated: ${normalizePath(path.relative(process.cwd(), baselinePath))}`);
  console.log(`Routes captured: ${snapshot.routeCount}`);
  process.exit(0);
}

if (!fs.existsSync(baselinePath)) {
  console.error(`Baseline missing: ${normalizePath(path.relative(process.cwd(), baselinePath))}`);
  console.error("Run `npm run verify:api-auth-surface -- --update` after reviewing the route surface.");
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
if (JSON.stringify(snapshot, null, 2) !== JSON.stringify(baseline, null, 2)) {
  console.error("API auth surface drift detected.");
  console.error("Review route/method/auth-marker changes, then update the baseline intentionally:");
  console.error("  npm run verify:api-auth-surface -- --update");
  printDiffSummary(baseline.routes ?? [], snapshot.routes);
  process.exit(1);
}

console.log(`API auth surface verified: ${snapshot.routeCount} routes match baseline.`);

function collectRouteFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectRouteFiles(fullPath);
    }
    return entry.isFile() && entry.name === "route.ts" ? [fullPath] : [];
  });
}

function scanRoute(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const route = `/api/${normalizePath(path.relative(apiRoot, path.dirname(filePath)))}`.replace(/\/$/, "");
  const methods = [...content.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
  const authMarkers = markerPatterns
    .filter(([, pattern]) => pattern.test(content))
    .map(([name]) => name)
    .sort();

  return {
    route,
    methods,
    authMarkers,
    authState: authMarkers.length > 0 ? "auth-marker-present" : "no-auth-marker-detected",
  };
}

function printDiffSummary(previousRoutes, nextRoutes) {
  const previous = new Map(previousRoutes.map((route) => [route.route, route]));
  const next = new Map(nextRoutes.map((route) => [route.route, route]));

  const added = [...next.keys()].filter((route) => !previous.has(route));
  const removed = [...previous.keys()].filter((route) => !next.has(route));
  const changed = [...next.keys()].filter((route) => {
    if (!previous.has(route)) return false;
    return JSON.stringify(previous.get(route)) !== JSON.stringify(next.get(route));
  });

  for (const route of added.slice(0, 20)) {
    console.error(`+ ${route}`);
  }
  for (const route of removed.slice(0, 20)) {
    console.error(`- ${route}`);
  }
  for (const route of changed.slice(0, 20)) {
    console.error(`~ ${route}`);
  }
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}
