#!/usr/bin/env node

/**
 * Seizn CLI - AI Memory Platform
 *
 * Usage:
 *   seizn memory add "User prefers TypeScript" --type preference
 *   seizn search query "programming preferences" --mode hybrid
 *   seizn search temporal "preferences" --valid-at 2026-01-01
 *   seizn replay trace_123
 *   seizn canon pull > canon.yml
 *   seizn export save -o backup.json
 *   seizn migrate-from mem0 --api-key <key>
 *   seizn benchmark --modes vector,hybrid
 *   seizn config set api-key szn_...
 */

import { Command } from 'commander';
import { createMemoryCommand } from './commands/memory.js';
import { createSearchCommand } from './commands/search.js';
import { createExportCommand } from './commands/export.js';
import { createMigrateCommand } from './commands/migrate.js';
import { createBenchmarkCommand } from './commands/benchmark.js';
import { createConfigCommand } from './commands/config.js';
import { createSaveCommand } from './commands/save.js';
import { createLocalCommand } from './commands/local.js';
import { registerAuditCommand } from './commands/audit.js';
import { registerBenchCommand } from './commands/bench.js';
import { registerCanonCommand } from './commands/canon.js';
import { registerInitCommand } from './commands/init.js';
import { registerLoginCommand } from './commands/login.js';
import { registerReplayCommand } from './commands/replay.js';

const program = new Command();

program
  .name('seizn')
  .description('Seizn AI Memory Platform CLI')
  .version('0.9.0-beta.1')
  .option('-b, --base-url <url>', 'Seizn API base URL')
  .option('-t, --token <key>', 'Seizn API key')
  .option('--json', 'print JSON output where supported');

registerInitCommand(program);
registerLoginCommand(program);
registerReplayCommand(program);
registerAuditCommand(program);
registerBenchCommand(program);
registerCanonCommand(program);
program.addCommand(createSaveCommand());
program.addCommand(createLocalCommand());
program.addCommand(createMemoryCommand());
program.addCommand(createSearchCommand());
program.addCommand(createExportCommand());
program.addCommand(createMigrateCommand());
program.addCommand(createBenchmarkCommand());
program.addCommand(createConfigCommand());

program.parseAsync(process.argv).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
