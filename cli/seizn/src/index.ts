#!/usr/bin/env node

/**
 * Seizn CLI - AI Memory Platform
 *
 * Usage:
 *   seizn memory add "User prefers TypeScript" --type preference
 *   seizn search query "programming preferences" --mode hybrid
 *   seizn search temporal "preferences" --valid-at 2026-01-01
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

const program = new Command();

program
  .name('seizn')
  .description('Seizn AI Memory Platform CLI')
  .version('0.1.0');

program.addCommand(createMemoryCommand());
program.addCommand(createSearchCommand());
program.addCommand(createExportCommand());
program.addCommand(createMigrateCommand());
program.addCommand(createBenchmarkCommand());
program.addCommand(createConfigCommand());

program.parse();
