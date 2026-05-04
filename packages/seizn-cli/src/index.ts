#!/usr/bin/env node
import { Command } from "commander";
import { runSave } from "./commands/save.js";
import { runSearch } from "./commands/search.js";
import { runExport } from "./commands/export.js";

const program = new Command();

program
  .name("seizn")
  .description("Command-line interface for Seizn AI memory")
  .version("0.9.0-beta.1");

program
  .command("save")
  .description("Save a memory")
  .argument("<content>", "memory content")
  .option("-t, --tags <list>", "comma-separated tags")
  .option("-a, --agent-id <id>", "agent identifier (multi-agent setups)")
  .option("-s, --scope <scope>", "memory scope")
  .option("--auto-score", "request Haiku-based importance scoring")
  .option("--no-dedup", "disable similarity-based dedup (default: enabled)")
  .option("--base-url <url>", "override API base URL")
  .action(async (content: string, opts) => {
    try {
      await runSave(content, opts);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("search")
  .description("Search memories")
  .argument("<query>", "search query")
  .option("-m, --mode <mode>", "hybrid | vector | lexical", "hybrid")
  .option("-l, --limit <n>", "max results")
  .option("-a, --agent-id <id>", "agent identifier")
  .option("-s, --scope <scope>", "memory scope")
  .option("--json", "output JSON instead of formatted text")
  .option("--base-url <url>", "override API base URL")
  .action(async (query: string, opts) => {
    try {
      await runSearch(query, opts);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("export")
  .description("Export memories (json or ndjson)")
  .option("-f, --format <format>", "json | ndjson", "json")
  .option("-a, --agent-id <id>", "agent identifier")
  .option("-s, --scope <scope>", "memory scope")
  .option("--base-url <url>", "override API base URL")
  .action(async (opts) => {
    try {
      await runExport(opts);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
