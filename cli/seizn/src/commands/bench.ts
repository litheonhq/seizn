import { performance } from "node:perf_hooks";
import type { Command } from "commander";
import { SeiznApiClient } from "../api.js";
import { printJson } from "../format.js";
import type { GlobalOptions } from "../types.js";

interface BenchOptions {
  requests?: string;
  json?: boolean;
}

function parseRequests(value?: string) {
  const parsed = Number.parseInt(value || "20", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 20;
  return Math.min(parsed, 200);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

export function registerBenchCommand(program: Command) {
  program
    .command("bench")
    .description("Measure simple Seizn API latency from this machine")
    .option("-r, --requests <number>", "number of memory-list requests", "20")
    .option("--json", "print raw benchmark output")
    .action(async (options: BenchOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const client = await SeiznApiClient.create(globals);
      const requests = parseRequests(options.requests);
      const samples: number[] = [];
      const start = performance.now();

      for (let index = 0; index < requests; index += 1) {
        const requestStart = performance.now();
        await client.listMemories({ limit: 1 });
        samples.push(performance.now() - requestStart);
      }

      const totalMs = performance.now() - start;
      const result = {
        requests,
        totalMs: Math.round(totalMs),
        p50Ms: Math.round(percentile(samples, 50)),
        p95Ms: Math.round(percentile(samples, 95)),
        minMs: Math.round(Math.min(...samples)),
        maxMs: Math.round(Math.max(...samples)),
      };

      if (options.json || globals.json) {
        printJson(result);
      } else {
        console.log(`Requests: ${result.requests}`);
        console.log(`Total: ${result.totalMs}ms`);
        console.log(`P50: ${result.p50Ms}ms`);
        console.log(`P95: ${result.p95Ms}ms`);
      }
    });
}
