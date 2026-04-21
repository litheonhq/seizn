/**
 * Export/Import Commands
 *
 * seizn export --format json -o backup.json
 * seizn import backup.json
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFile, readFile } from 'node:fs/promises';
import { createCLIClient } from '../client.js';
import { SeiznApiClient } from '../api.js';
import { lockRows, memoryRows, printJson, toCsv } from '../format.js';
import type { GlobalOptions } from '../types.js';

interface DirectExportOptions {
  entity?: 'memories' | 'canon';
  format?: 'json' | 'csv';
  limit?: string;
  namespace?: string;
}

function parseLimit(value?: string) {
  const parsed = Number.parseInt(value || '100', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(parsed, 100);
}

export function createExportCommand(): Command {
  const cmd = new Command('export')
    .description('Export memories or canon locks')
    .option('-e, --entity <entity>', 'memories or canon', 'memories')
    .option('-f, --format <format>', 'json or csv', 'json')
    .option('-l, --limit <number>', 'maximum memory rows', '100')
    .option('-n, --namespace <name>', 'memory namespace')
    .action(async (opts: DirectExportOptions, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const client = await SeiznApiClient.create(globals);
      const format = opts.format === 'csv' ? 'csv' : 'json';

      if (opts.entity === 'canon') {
        const { locks } = await client.listCanon();
        if (format === 'csv') process.stdout.write(toCsv(lockRows(locks)));
        else printJson({ locks });
        return;
      }

      const memories = await client.listMemories({
        limit: parseLimit(opts.limit),
        namespace: opts.namespace,
      });
      if (format === 'csv') process.stdout.write(toCsv(memoryRows(memories.results || [])));
      else printJson(memories);
    });

  cmd
    .command('save')
    .description('Export memories to a file')
    .option('-f, --format <format>', 'Output format (json, csv)', 'json')
    .option('-o, --output <path>', 'Output file path', 'seizn-export.json')
    .option('-n, --namespace <ns>', 'Filter by namespace')
    .option('-t, --type <type>', 'Filter by memory type')
    .option('-l, --limit <n>', 'Maximum memories', '10000')
    .action(async (opts: any) => {
      const spinner = ora('Exporting memories...').start();
      try {
        const client = createCLIClient();
        const params: Record<string, string> = {
          format: opts.format,
          limit: opts.limit,
        };
        if (opts.namespace) params.namespace = opts.namespace;
        if (opts.type) params.memory_type = opts.type;

        const result = await client.request<Record<string, unknown>>('/memories/export', { params });

        if (opts.format === 'csv') {
          await writeFile(opts.output, result.csv as string, 'utf-8');
        } else {
          await writeFile(opts.output, JSON.stringify(result, null, 2), 'utf-8');
        }

        spinner.succeed(`Exported to ${chalk.green(opts.output)}`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  cmd
    .command('load <file>')
    .description('Import memories from a file')
    .option('--skip-duplicates', 'Skip duplicate memories', true)
    .action(async (file: string, opts: any) => {
      const spinner = ora('Importing memories...').start();
      try {
        const client = createCLIClient();
        const content = await readFile(file, 'utf-8');
        const data = JSON.parse(content);

        const memories = data.memories ?? data;
        if (!Array.isArray(memories)) {
          throw new Error('File must contain an array of memories or a valid export object');
        }

        const result = await client.request<{ imported: number; skipped: number }>('/memories/import', {
          method: 'POST',
          body: {
            memories,
            skip_duplicates: opts.skipDuplicates,
          },
        });

        spinner.succeed(`Imported ${chalk.green(result.imported)} memories (${result.skipped} skipped)`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return cmd;
}
