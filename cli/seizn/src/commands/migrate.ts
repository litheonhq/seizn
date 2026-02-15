/**
 * Migration Commands
 *
 * seizn migrate-from mem0 --api-key <key>
 * seizn migrate-from json <file>
 * seizn migrate-from csv <file>
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFile } from 'node:fs/promises';
import { createCLIClient } from '../client.js';

export function createMigrateCommand(): Command {
  const migrate = new Command('migrate-from').description('Migrate memories from other platforms');

  migrate
    .command('mem0')
    .description('Migrate from Mem0')
    .requiredOption('--api-key <key>', 'Mem0 API key')
    .option('--base-url <url>', 'Mem0 API base URL', 'https://api.mem0.ai/v1')
    .option('-n, --namespace <ns>', 'Target namespace', 'default')
    .action(async (opts: any) => {
      const spinner = ora('Fetching memories from Mem0...').start();
      try {
        // Fetch from Mem0
        const mem0Response = await fetch(`${opts.baseUrl}/memories/`, {
          headers: { Authorization: `Token ${opts.apiKey}` },
        });

        if (!mem0Response.ok) {
          throw new Error(`Mem0 API error: ${mem0Response.status}`);
        }

        const mem0Data = (await mem0Response.json()) as { results?: Array<{ memory: string; metadata?: Record<string, unknown> }> };
        const mem0Memories = mem0Data.results ?? [];

        spinner.text = `Importing ${mem0Memories.length} memories to Seizn...`;

        // Transform and import
        const client = createCLIClient();
        const memories = mem0Memories.map((m) => ({
          content: m.memory,
          memory_type: 'fact',
          tags: ['migrated-from-mem0'],
          namespace: opts.namespace,
        }));

        const result = await client.request<{ imported: number; skipped: number }>('/memories/import', {
          method: 'POST',
          body: { memories, skip_duplicates: true },
        });

        spinner.succeed(
          `Migrated ${chalk.green(result.imported)} memories from Mem0 (${result.skipped} skipped)`
        );
      } catch (error) {
        spinner.fail(`Migration failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  migrate
    .command('json <file>')
    .description('Migrate from a JSON file')
    .option('-n, --namespace <ns>', 'Target namespace', 'default')
    .action(async (file: string, opts: any) => {
      const spinner = ora('Importing from JSON...').start();
      try {
        const client = createCLIClient();
        const content = await readFile(file, 'utf-8');
        const data = JSON.parse(content);
        const items = Array.isArray(data) ? data : data.memories ?? [data];

        const memories = items.map((item: Record<string, unknown>) => ({
          content: item.content ?? item.text ?? item.memory ?? String(item),
          memory_type: item.type ?? item.memory_type ?? 'fact',
          tags: (item.tags as string[]) ?? ['migrated'],
          namespace: opts.namespace,
        }));

        const result = await client.request<{ imported: number; skipped: number }>('/memories/import', {
          method: 'POST',
          body: { memories, skip_duplicates: true },
        });

        spinner.succeed(`Imported ${chalk.green(result.imported)} memories (${result.skipped} skipped)`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  migrate
    .command('csv <file>')
    .description('Migrate from a CSV file')
    .option('-n, --namespace <ns>', 'Target namespace', 'default')
    .option('--content-col <col>', 'Content column name', 'content')
    .option('--type-col <col>', 'Type column name', 'type')
    .action(async (file: string, opts: any) => {
      const spinner = ora('Importing from CSV...').start();
      try {
        const client = createCLIClient();
        const content = await readFile(file, 'utf-8');
        const lines = content.trim().split('\n');
        const headers = lines[0].split(',').map((h) => h.trim().replace(/"/g, ''));

        const contentIdx = headers.indexOf(opts.contentCol);
        if (contentIdx === -1) {
          throw new Error(`Column "${opts.contentCol}" not found. Available: ${headers.join(', ')}`);
        }

        const typeIdx = headers.indexOf(opts.typeCol);

        const memories = lines.slice(1).map((line) => {
          const cols = line.split(',').map((c) => c.trim().replace(/"/g, ''));
          return {
            content: cols[contentIdx],
            memory_type: typeIdx >= 0 ? cols[typeIdx] : 'fact',
            tags: ['migrated-from-csv'],
            namespace: opts.namespace,
          };
        });

        const result = await client.request<{ imported: number; skipped: number }>('/memories/import', {
          method: 'POST',
          body: { memories, skip_duplicates: true },
        });

        spinner.succeed(`Imported ${chalk.green(result.imported)} memories (${result.skipped} skipped)`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return migrate;
}
