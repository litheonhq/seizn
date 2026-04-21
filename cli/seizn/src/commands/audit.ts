import type { Command } from "commander";
import { SeiznApiClient } from "../api.js";
import { printJson, printTable } from "../format.js";
import type { CanonLock, GlobalOptions, MemoryResult } from "../types.js";

interface AuditOptions {
  limit?: string;
  json?: boolean;
}

function parseLimit(value?: string) {
  const parsed = Number.parseInt(value || "50", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}

function memoryText(memory: MemoryResult) {
  return String(memory.content || memory.memory || "");
}

function lockMatches(lock: CanonLock, memory: MemoryResult) {
  const content = memoryText(memory);
  if (!content || !lock.active) return false;

  if (lock.npcId) {
    const npcId = String(memory.entity_id || memory.agent_id || "");
    if (npcId && npcId !== lock.npcId) return false;
  }

  if (lock.regexFastpath) {
    try {
      if (new RegExp(lock.regexFastpath, "i").test(content)) return true;
    } catch {
      return false;
    }
  }

  if ((lock.scope === "never_say" || lock.scope === "must_not_know") && lock.statement.length >= 4) {
    return content.toLowerCase().includes(lock.statement.toLowerCase());
  }

  return false;
}

export function registerAuditCommand(program: Command) {
  program
    .command("audit")
    .description("Run a local canon fast-path audit over recent memories")
    .option("-l, --limit <number>", "maximum memory rows to inspect", "50")
    .option("--json", "print raw audit findings")
    .action(async (options: AuditOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const client = await SeiznApiClient.create(globals);
      const [{ locks }, memories] = await Promise.all([
        client.listCanon(),
        client.listMemories({ limit: parseLimit(options.limit) }),
      ]);

      const findings = [];
      for (const memory of memories.results || []) {
        for (const lock of locks) {
          if (!lockMatches(lock, memory)) continue;
          findings.push({
            memoryId: memory.id || "",
            lockId: lock.id || "",
            npc: lock.npcId || "world",
            severity: lock.severity,
            scope: lock.scope,
            excerpt: memoryText(memory).slice(0, 120),
          });
        }
      }

      if (options.json || globals.json) {
        printJson({ checked: memories.results?.length || 0, findings });
      } else {
        console.log(`Checked ${memories.results?.length || 0} memories against ${locks.length} canon locks.`);
        printTable(findings);
      }
    });
}
