#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_PATHS = [
  "docs/marketing",
  "src/app/[locale]/page.tsx",
  "src/app/[locale]/demo",
  "src/app/[locale]/pricing",
  "src/app/demo",
  "src/app/legal",
  "src/app/pricing",
  "src/components/landing",
  "public",
  ".next/server/app/[locale]/page.js",
  ".next/server/app/[locale]/demo",
  ".next/server/app/[locale]/pricing",
  ".next/server/app/demo",
  ".next/server/app/legal",
  ".next/server/app/pricing",
];

const DEFAULT_KEYWORDS = [
  "소리",
  "레이카",
  "나나",
  "룰루",
  "유이",
  "KNOT",
  "결",
  "청학여고",
  "도깨비",
];

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
]);

const DEFAULT_EXCLUDE = new Set([
  normalizePath("docs/marketing/dual_surface_positioning.md"),
  normalizePath("docs/marketing/seizn_author_landing_brief.md"),
]);

const args = parseArgs(process.argv.slice(2));
const paths = args.paths.length > 0 ? args.paths : DEFAULT_PATHS;
const keywords = args.keywords.length > 0 ? args.keywords : DEFAULT_KEYWORDS;
const exclude = new Set([...DEFAULT_EXCLUDE, ...args.exclude.map(normalizePath)]);
const compiled = keywords.map((keyword) => ({ keyword, pattern: compileKeyword(keyword) }));
const matches = [];
const filesToScan = new Map();

for (const inputPath of paths) {
  const absolute = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absolute)) {
    continue;
  }
  for (const file of collectFiles(absolute)) {
    addScanFile(filesToScan, file);
  }
}

for (const file of collectNextRouteBuildFiles(filesToScan)) {
  addScanFile(filesToScan, file);
}

for (const file of filesToScan.values()) {
  const relative = normalizePath(path.relative(process.cwd(), file));
  if (exclude.has(relative)) continue;
  if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
  const content = fs.readFileSync(file, "utf8");
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { keyword, pattern } of compiled) {
      if (pattern.test(line)) {
        matches.push({
          file: relative,
          line: index + 1,
          keyword,
          preview: line.trim().slice(0, 180),
        });
      }
    }
  });
}

if (matches.length > 0) {
  console.error("KNOT separation guard failed. Forbidden internal-IP terms found:");
  for (const match of matches) {
    console.error(`${match.file}:${match.line} [${match.keyword}] ${match.preview}`);
  }
  process.exit(1);
}

console.log(`KNOT separation guard passed: 0 matches across ${paths.join(", ")}`);

function parseArgs(rawArgs) {
  const result = { paths: [], keywords: [], exclude: [] };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--paths") {
      result.paths.push(...splitList(rawArgs[index + 1]));
      index += 1;
    } else if (arg.startsWith("--paths=")) {
      result.paths.push(...splitList(arg.slice("--paths=".length)));
    } else if (arg === "--keywords") {
      result.keywords.push(...splitList(rawArgs[index + 1]));
      index += 1;
    } else if (arg.startsWith("--keywords=")) {
      result.keywords.push(...splitList(arg.slice("--keywords=".length)));
    } else if (arg === "--exclude") {
      result.exclude.push(...splitList(rawArgs[index + 1]));
      index += 1;
    } else if (arg.startsWith("--exclude=")) {
      result.exclude.push(...splitList(arg.slice("--exclude=".length)));
    }
  }
  return result;
}

function splitList(value) {
  if (!value) return [];
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function collectFiles(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return [inputPath];
  if (!stat.isDirectory()) return [];

  const files = [];
  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const child = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

function addScanFile(files, file) {
  const absolute = path.resolve(file);
  files.set(normalizePath(absolute), absolute);
}

function collectNextRouteBuildFiles(filesToScan) {
  const discovered = new Map();
  for (const file of filesToScan.values()) {
    const relative = normalizePath(path.relative(process.cwd(), file));
    if (!relative.startsWith(".next/server/app/") || path.extname(file) !== ".js") {
      continue;
    }

    for (const chunk of collectRouteServerChunks(file)) {
      addScanFile(discovered, chunk);
    }

    const routeBuildManifest = path.join(
      path.dirname(file),
      path.basename(file, ".js"),
      "build-manifest.json"
    );
    for (const chunk of collectRouteClientChunks(routeBuildManifest)) {
      addScanFile(discovered, chunk);
    }
  }

  return [...discovered.values()];
}

function collectRouteServerChunks(entrypoint) {
  if (!fs.existsSync(entrypoint)) return [];
  const content = fs.readFileSync(entrypoint, "utf8");
  const files = [];
  const regex = /R\.c\("([^"]+)"\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const chunk = path.resolve(process.cwd(), ".next", match[1]);
    if (fs.existsSync(chunk)) {
      files.push(chunk);
    }
  }
  return files;
}

function collectRouteClientChunks(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const files = [];
    for (const value of Object.values(manifest)) {
      if (Array.isArray(value)) {
        files.push(...value);
      }
    }
    return files
      .filter((file) => typeof file === "string" && file.startsWith("static/"))
      .map((file) => path.resolve(process.cwd(), ".next", file))
      .filter((file) => fs.existsSync(file));
  } catch {
    return [];
  }
}

function compileKeyword(keyword) {
  const escaped = escapeRegExp(keyword);
  if (/^[A-Za-z0-9_-]+$/.test(keyword)) {
    return new RegExp(`\\b${escaped}\\b`, "i");
  }
  return new RegExp(`(^|[^가-힣A-Za-z0-9])${escaped}($|[^가-힣A-Za-z0-9])`, "i");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePath(value) {
  return value.replaceAll("\\", "/");
}
