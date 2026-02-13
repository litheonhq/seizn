#!/usr/bin/env node
/**
 * Cross-platform bundle analysis.
 *
 * Note: `@next/bundle-analyzer` requires a webpack build; Turbopack does not
 * generate the stats needed for analyzer reports.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

process.env.ANALYZE = "true";
// Webpack build + bundle analyzer can exceed Node's default heap on this repo.
// Keep this local to the analyze command to avoid changing normal builds.
if (!process.env.NODE_OPTIONS?.includes("--max-old-space-size")) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=8192`.trim();
}

const node = process.execPath;
const nextBin = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next"
);

const checkRoutes = spawnSync(node, ["scripts/check-route-conflicts.js"], {
  stdio: "inherit",
  env: process.env,
});
if (checkRoutes.status !== 0) {
  process.exit(checkRoutes.status ?? 1);
}

const build = spawnSync(nextBin, ["build", "--webpack"], {
  stdio: "inherit",
  env: process.env,
  // On Windows, `.cmd` shims require a shell to execute reliably.
  shell: process.platform === "win32",
});
if (build.error) {
  console.error(build.error);
}
process.exit(build.status ?? 1);
