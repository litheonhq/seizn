#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const writeMapArg = process.argv.find((arg) => arg.startsWith('--write-map='));
const writeMapPath = writeMapArg ? writeMapArg.split('=')[1] : null;
const keepNameMapArg = process.argv.find((arg) => arg.startsWith('--keep-name-map='));
const keepNameMapPath = keepNameMapArg ? keepNameMapArg.split('=')[1] : null;

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const keepNameMap = {};

if (keepNameMapPath) {
  const absoluteKeepNameMapPath = path.isAbsolute(keepNameMapPath)
    ? keepNameMapPath
    : path.join(repoRoot, keepNameMapPath);
  Object.assign(keepNameMap, JSON.parse(fs.readFileSync(absoluteKeepNameMapPath, 'utf8')));
}

if (!fs.existsSync(migrationsDir)) {
  console.error(`Migrations directory not found: ${migrationsDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort();

const byVersion = new Map();
for (const file of files) {
  const match = file.match(/^(\d+)(.*)$/);
  if (!match) {
    continue;
  }

  const version = match[1];
  const suffix = match[2];

  if (!byVersion.has(version)) {
    byVersion.set(version, []);
  }

  byVersion.get(version).push({ file, version, suffix });
}

const usedVersions = new Set([...byVersion.keys()]);
const usedFilenames = new Set(files);
const renamePlan = [];

for (const [version, entries] of [...byVersion.entries()].sort()) {
  if (entries.length <= 1) {
    continue;
  }

  entries.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  const preferredName = keepNameMap[version];
  let keepEntry = entries[0];

  if (preferredName) {
    const preferred = entries.find((entry) => {
      const stem = entry.file.slice(0, -4);
      const afterVersion = stem.slice(version.length).replace(/^_/, '');
      return preferredName === afterVersion || preferredName === stem;
    });

    if (preferred) {
      keepEntry = preferred;
    }
  }

  const renamingTargets = entries.filter((entry) => entry.file !== keepEntry.file);

  for (let index = 0; index < renamingTargets.length; index += 1) {
    const entry = renamingTargets[index];
    let candidateVersion = `${version}${String(index + 2).padStart(3, '0')}`;

    while (usedVersions.has(candidateVersion)) {
      const numeric = Number(candidateVersion);
      candidateVersion = String(Number.isFinite(numeric) ? numeric + 1 : `${candidateVersion}1`);
    }

    const candidateFile = `${candidateVersion}${entry.suffix}`;

    if (usedFilenames.has(candidateFile)) {
      console.error(`Target filename collision detected: ${candidateFile}`);
      process.exit(1);
    }

    renamePlan.push({
      from: entry.file,
      to: candidateFile,
      oldVersion: version,
      newVersion: candidateVersion,
      preserved: keepEntry.file,
    });

    usedVersions.add(candidateVersion);
    usedFilenames.add(candidateFile);
  }
}

const summary = {
  totalFiles: files.length,
  uniqueVersionsBefore: byVersion.size,
  duplicateGroups: [...byVersion.values()].filter((group) => group.length > 1).length,
  renamedFiles: renamePlan.length,
  apply,
};

console.log(JSON.stringify({ summary, renamePlan }, null, 2));

if (writeMapPath) {
  const absoluteWriteMapPath = path.isAbsolute(writeMapPath)
    ? writeMapPath
    : path.join(repoRoot, writeMapPath);

  fs.writeFileSync(absoluteWriteMapPath, `${JSON.stringify({ summary, renamePlan }, null, 2)}\n`, 'utf8');
  console.error(`Wrote mapping file: ${absoluteWriteMapPath}`);
}

if (!apply) {
  process.exit(0);
}

for (const item of renamePlan) {
  const source = path.join(migrationsDir, item.from);
  const destination = path.join(migrationsDir, item.to);
  fs.renameSync(source, destination);
}

console.error(`Applied ${renamePlan.length} migration filename renames.`);
