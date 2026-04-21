import type { Command } from "commander";
import { SeiznApiClient } from "../api.js";
import { compact, printJson } from "../format.js";
import type { GlobalOptions } from "../types.js";

function summarizeSnapshot(snapshot: Record<string, unknown>) {
  const traceId = compact(snapshot.trace_id || snapshot.traceId || snapshot.id, "unknown");
  const eventCount = Array.isArray(snapshot.events) ? snapshot.events.length : 0;
  const memoryHash = compact(snapshot.memory_hash || snapshot.memoryHash || snapshot.content_hash, "unknown");
  const createdAt = compact(snapshot.created_at || snapshot.createdAt, "unknown");

  console.log(`Trace: ${traceId}`);
  console.log(`Created: ${createdAt}`);
  console.log(`Memory hash: ${memoryHash}`);
  console.log(`Events: ${eventCount}`);
}

export function registerReplayCommand(program: Command) {
  program
    .command("replay")
    .description("Fetch a deterministic replay snapshot")
    .argument("<trace-id>", "replay trace id")
    .option("--json", "print the raw replay payload")
    .action(async (traceId: string, options: { json?: boolean }, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const client = await SeiznApiClient.create(globals);
      const payload = await client.getReplay(traceId);

      if (options.json || globals.json) {
        printJson(payload);
      } else {
        summarizeSnapshot(payload.snapshot || {});
      }
    });
}
