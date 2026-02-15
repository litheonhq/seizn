/**
 * Local (Offline-only) Memory Commands
 *
 * - No API key required
 * - Stores data under ~/.seizn/local/memories.jsonl
 *
 * Examples:
 *   seizn local save "User prefers dark mode" --type preference --tags ui
 *   seizn local search "dark mode" --limit 10
 *   seizn local list --limit 20
 *   seizn local export -o backup.json
 *   seizn local clear --yes
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFile } from 'node:fs/promises';
import {
  appendLocalMemory,
  clearLocalMemories,
  getLocalMemoryFilePath,
  readLocalMemories,
  searchLocalMemories,
} from '../local-store.js';

export function createLocalCommand(): Command {
  const local = new Command('local').description('Offline-only local memory store (no network required)');

  local
    .command('path')
    .description('Show the local memory file path')
    .action(() => {
      console.log(getLocalMemoryFilePath());
    });

  local
    .command('save')
    .description('Save a memory locally (offline-only)')
    .argument('<content>', 'Memory content (use "-" to read from stdin)')
    .option('-t, --type <type>', 'Memory type (fact, preference, experience, relationship, instruction)', 'fact')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-n, --namespace <ns>', 'Namespace', 'default')
    .option('-q, --quiet', 'Quiet mode: print only the memory ID')
    .action(async (content: string, opts: any) => {
      if (content === '-') {
        content = await readStdin();
        if (!content.trim()) {
          console.error(chalk.red('Error: No content received from stdin'));
          process.exit(1);
        }
      }

      const spinner = opts.quiet ? null : ora('Saving locally...').start();
      try {
        const entry = await appendLocalMemory({
          content,
          memoryType: opts.type,
          tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
          namespace: opts.namespace,
        });

        if (opts.quiet) {
          console.log(entry.id);
          return;
        }

        spinner?.succeed('Saved locally');
        console.log(chalk.dim(`  ID: ${entry.id}`));
        console.log(chalk.dim(`  Type: ${entry.memoryType}`));
        console.log(chalk.dim(`  Namespace: ${entry.namespace}`));
        if (entry.tags.length > 0) console.log(chalk.dim(`  Tags: ${entry.tags.join(', ')}`));
        console.log(`  ${chalk.green(entry.content.length > 100 ? entry.content.slice(0, 100) + '...' : entry.content)}`);
      } catch (error) {
        if (opts.quiet) process.exit(1);
        spinner?.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  local
    .command('search')
    .description('Search locally stored memories')
    .argument('<query>', 'Search query')
    .option('-l, --limit <n>', 'Maximum results (max 200)', '10')
    .option('-n, --namespace <ns>', 'Namespace filter')
    .option('-t, --type <type>', 'Memory type filter')
    .option('--tags <tags>', 'Comma-separated tag filters (must match all)')
    .action(async (query: string, opts: any) => {
      const spinner = ora('Searching locally...').start();
      try {
        const entries = await readLocalMemories();
        const results = searchLocalMemories(entries, query, {
          limit: parseInt(opts.limit, 10) || 10,
          namespace: opts.namespace,
          memoryType: opts.type,
          tags: opts.tags ? opts.tags.split(',') : [],
        });

        spinner.stop();
        console.log(chalk.bold(`${results.length} results\n`));

        for (const r of results) {
          const score = chalk.yellow(`(${r.score.toFixed(3)})`);
          const type = chalk.cyan(`[${r.entry.memoryType}]`);
          const ns = chalk.dim(r.entry.namespace);
          const id = chalk.dim(r.entry.id.slice(0, 8));
          console.log(`  ${id} ${score} ${type} ${ns} ${r.entry.content}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  local
    .command('list')
    .description('List most recent local memories')
    .option('-l, --limit <n>', 'Maximum entries (max 200)', '20')
    .option('-n, --namespace <ns>', 'Namespace filter')
    .action(async (opts: any) => {
      const spinner = ora('Loading local memories...').start();
      try {
        const entries = await readLocalMemories();
        const limit = Math.max(1, Math.min(parseInt(opts.limit, 10) || 20, 200));
        const filtered = opts.namespace ? entries.filter((e) => e.namespace === opts.namespace) : entries;
        const list = filtered
          .slice()
          .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
          .slice(0, limit);

        spinner.stop();
        console.log(chalk.bold(`${list.length} entries\n`));
        for (const e of list) {
          const time = chalk.yellow(e.createdAt.slice(0, 10));
          const type = chalk.cyan(`[${e.memoryType}]`);
          const id = chalk.dim(e.id.slice(0, 8));
          console.log(`  ${id} ${time} ${type} ${e.content}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  local
    .command('export')
    .description('Export local memories to a JSON file')
    .option('-o, --out <file>', 'Output file path', 'seizn-local-memories.json')
    .action(async (opts: any) => {
      const spinner = ora('Exporting...').start();
      try {
        const entries = await readLocalMemories();
        await writeFile(opts.out, JSON.stringify({ exportedAt: new Date().toISOString(), entries }, null, 2), 'utf8');
        spinner.succeed(`Exported ${entries.length} entries to ${opts.out}`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  local
    .command('clear')
    .description('Delete all local memories (offline store)')
    .option('-y, --yes', 'Confirm deletion')
    .action(async (opts: any) => {
      if (!opts.yes) {
        console.error(chalk.red('Refusing to clear without --yes'));
        process.exit(1);
      }

      const spinner = ora('Clearing...').start();
      try {
        await clearLocalMemories();
        spinner.succeed('Cleared local memories');
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return local;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(String(chunk)));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.resume();
  });
}
