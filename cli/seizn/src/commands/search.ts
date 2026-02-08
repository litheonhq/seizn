/**
 * Search Commands
 *
 * seizn search <query> --mode vector --limit 10
 * seizn search temporal <query> --valid-at 2026-01-01
 * seizn search timeline --start 2026-01-01 --end 2026-02-01
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createCLIClient } from '../client.js';

export function createSearchCommand(): Command {
  const search = new Command('search').description('Search memories');

  search
    .command('query <query>')
    .description('Semantic search for memories')
    .option('-m, --mode <mode>', 'Search mode (vector, hybrid, keyword)', 'vector')
    .option('-l, --limit <n>', 'Maximum results', '10')
    .option('--threshold <n>', 'Similarity threshold', '0.7')
    .option('-n, --namespace <ns>', 'Namespace')
    .action(async (query: string, opts) => {
      const spinner = ora('Searching...').start();
      try {
        const client = createCLIClient();
        const params: Record<string, string> = {
          query,
          mode: opts.mode,
          limit: opts.limit,
          threshold: opts.threshold,
        };
        if (opts.namespace) params.namespace = opts.namespace;

        const result = await client.request<{ results: Array<Record<string, unknown>>; count: number }>(
          '/memories',
          { params }
        );
        spinner.stop();
        console.log(chalk.bold(`${result.count} results\n`));
        for (const r of result.results) {
          const score = chalk.yellow(`(${Number(r.similarity).toFixed(3)})`);
          const type = chalk.cyan(`[${r.memoryType}]`);
          const id = chalk.dim(String(r.id).slice(0, 8));
          console.log(`  ${id} ${score} ${type} ${r.content}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  search
    .command('temporal <query>')
    .description('Search memories valid at a specific time')
    .option('--valid-at <date>', 'Valid at date (ISO 8601)', new Date().toISOString())
    .option('-l, --limit <n>', 'Maximum results', '20')
    .option('--types <types>', 'Comma-separated memory types')
    .action(async (query: string, opts) => {
      const spinner = ora('Temporal searching...').start();
      try {
        const client = createCLIClient();
        const params: Record<string, string> = {
          valid_at: opts.validAt,
          query,
          top_k: opts.limit,
        };
        if (opts.types) params.types = opts.types;

        const result = await client.request<{ results: Array<Record<string, unknown>>; count: number }>(
          '/spring/temporal/search',
          { params }
        );
        spinner.stop();
        console.log(chalk.bold(`${result.count} temporal results\n`));
        for (const r of result.results) {
          const type = chalk.cyan(`[${r.type}]`);
          const valid = r.validFrom
            ? chalk.dim(`(${r.validFrom} → ${r.validTo || 'now'})`)
            : '';
          console.log(`  ${chalk.dim(String(r.id).slice(0, 8))} ${type} ${r.content} ${valid}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  search
    .command('timeline')
    .description('View memory timeline')
    .option('--start <date>', 'Start date (ISO 8601)')
    .option('--end <date>', 'End date (ISO 8601)')
    .option('-l, --limit <n>', 'Maximum entries', '50')
    .option('--types <types>', 'Comma-separated memory types')
    .action(async (opts) => {
      const spinner = ora('Loading timeline...').start();
      try {
        const client = createCLIClient();
        const params: Record<string, string> = { limit: opts.limit };
        if (opts.start) params.start_date = opts.start;
        if (opts.end) params.end_date = opts.end;
        if (opts.types) params.types = opts.types;

        const result = await client.request<{ entries: Array<Record<string, unknown>>; count: number }>(
          '/spring/temporal/timeline',
          { params }
        );
        spinner.stop();
        console.log(chalk.bold(`Timeline: ${result.count} entries\n`));
        for (const e of result.entries) {
          const time = chalk.yellow(String(e.eventTime).slice(0, 10));
          const valid = e.isCurrentlyValid ? chalk.green('VALID') : chalk.red('EXPIRED');
          console.log(`  ${time} [${valid}] ${e.content}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return search;
}
