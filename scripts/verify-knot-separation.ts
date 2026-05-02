#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const DEFAULT_PATHS = [
  "docs/marketing",
  "src/app/[locale]/page.tsx",
  "src/app/[locale]/demo",
  "src/app/demo",
  "src/app/legal",
  "src/app/pricing",
  "src/components/landing",
  "public",
  ".next/server/app/[locale]/page.js",
  ".next/server/app/[locale]/demo",
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
  normalizePath("docs/marketing/sample_ip/saebyeok-readme.md"),
]);

const args = parseArgs(process.argv.slice(2));
const paths = args.paths.length > 0 ? args.paths : DEFAULT_PATHS;
const keywords = args.keywords.length > 0 ? args.keywords : DEFAULT_KEYWORDS;
const exclude = new Set([...DEFAULT_EXCLUDE, ...args.exclude.map(normalizePath)]);
const compiled = keywords.map((keyword) => ({ keyword, pattern: compileKeyword(keyword) }));
const matches = [];

for (const inputPath of paths) {
  const absolute = path.resolve(process.cwd(), inputPath);
  if (!fs.existsSync(absolute)) {
    continue;
  }
  for (const file of collectFiles(absolute)) {
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
