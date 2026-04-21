import { readFile, writeFile } from "node:fs/promises";
import { stdin as input } from "node:process";
import type { Command } from "commander";
import YAML from "yaml";
import { SeiznApiClient } from "../api.js";
import { lockRows, printJson, printTable } from "../format.js";
import type { CanonFile, CanonLock, GlobalOptions } from "../types.js";

interface CanonPullOptions {
  out?: string;
  json?: boolean;
}

interface CanonPushOptions {
  dryRun?: boolean;
  json?: boolean;
}

function normalizeLock(input: Partial<CanonLock>): CanonLock {
  if (!input.scope || !input.statement) {
    throw new Error("Canon lock entries need scope and statement.");
  }
  return {
    id: input.id,
    npcId: input.npcId || null,
    scope: input.scope,
    statement: input.statement,
    regexFastpath: input.regexFastpath || null,
    severity: input.severity || "hard",
    active: input.active !== false,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function editableEqual(a: CanonLock, b: CanonLock) {
  return (
    (a.npcId || null) === (b.npcId || null) &&
    a.scope === b.scope &&
    a.statement === b.statement &&
    (a.regexFastpath || null) === (b.regexFastpath || null) &&
    a.severity === b.severity &&
    a.active === b.active
  );
}

function toCanonFile(locks: CanonLock[]): CanonFile {
  return {
    locks: locks.map((lock) => ({
      ...(lock.id ? { id: lock.id } : {}),
      npcId: lock.npcId || null,
      scope: lock.scope,
      statement: lock.statement,
      regexFastpath: lock.regexFastpath || null,
      severity: lock.severity,
      active: lock.active,
    })),
  };
}

async function readStdin() {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readCanonFile(file: string) {
  const raw = file === "-" ? await readStdin() : await readFile(file, "utf8");
  const parsed = YAML.parse(raw) as Partial<CanonFile> | null;
  if (!parsed || !Array.isArray(parsed.locks)) {
    throw new Error("Canon file must contain a top-level locks array.");
  }
  return parsed.locks.map((lock) => normalizeLock(lock));
}

export function registerCanonCommand(program: Command) {
  const canon = program.command("canon").description("Manage Canon Lock rules");

  canon
    .command("list")
    .description("List canon locks")
    .option("--json", "print raw canon locks")
    .action(async (options: { json?: boolean }, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const client = await SeiznApiClient.create(globals);
      const { locks } = await client.listCanon();
      if (options.json || globals.json) printJson({ locks });
      else printTable(lockRows(locks));
    });

  canon
    .command("pull")
    .description("Export canon locks as YAML")
    .option("-o, --out <file>", "write YAML to a file instead of stdout")
    .option("--json", "print JSON instead of YAML")
    .action(async (options: CanonPullOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const client = await SeiznApiClient.create(globals);
      const { locks } = await client.listCanon();
      const payload = toCanonFile(locks);
      const output = options.json || globals.json ? JSON.stringify(payload, null, 2) : YAML.stringify(payload);

      if (options.out) {
        await writeFile(options.out, `${output.trimEnd()}\n`, "utf8");
        console.log(`Wrote ${options.out}`);
      } else {
        process.stdout.write(`${output.trimEnd()}\n`);
      }
    });

  canon
    .command("push")
    .description("Create or update canon locks from YAML")
    .argument("<file>", "YAML file from `seizn canon pull`, or - for stdin")
    .option("--dry-run", "show intended changes without mutating Seizn")
    .option("--json", "print JSON summary")
    .action(async (file: string, options: CanonPushOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const desired = await readCanonFile(file);
      const client = await SeiznApiClient.create(globals);
      const remote = await client.listCanon();
      const byId = new Map(remote.locks.filter((lock) => lock.id).map((lock) => [lock.id, lock]));
      const summary = { created: 0, updated: 0, skipped: 0, dryRun: options.dryRun === true };

      for (const lock of desired) {
        const current = lock.id ? byId.get(lock.id) : undefined;
        if (current && editableEqual(current, lock)) {
          summary.skipped += 1;
          continue;
        }
        if (options.dryRun) {
          current ? (summary.updated += 1) : (summary.created += 1);
          continue;
        }
        if (current && lock.id) {
          await client.updateCanonLock(lock.id, lock);
          summary.updated += 1;
        } else {
          await client.createCanonLock(lock);
          summary.created += 1;
        }
      }

      if (options.json || globals.json) printJson(summary);
      else console.log(`Canon push: ${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped.`);
    });
}
