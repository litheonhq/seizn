/**
 * Memory Commands
 *
 * seizn memory add "content" --type fact --tags tag1,tag2
 * seizn memory get <id>
 * seizn memory update <id> --tags tag1,tag2 --importance 8
 * seizn memory delete <id>
 * seizn memory list --limit 20 --namespace default
 * seizn memory stats
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createCLIClient } from '../client.js';

export function createMemoryCommand(): Command {
  const memory = new Command('memory').description('Manage memories');

  memory
    .command('add <content>')
    .description('Add a new memory')
    .option('-t, --type <type>', 'Memory type (fact, preference, experience, relationship, instruction)', 'fact')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-n, --namespace <ns>', 'Namespace', 'default')
    .action(async (content: string, opts) => {
      const spinner = ora('Adding memory...').start();
      try {
        const client = createCLIClient();
        const result = await client.request<{ success: boolean; memory: Record<string, unknown> }>('/memories', {
          method: 'POST',
          body: {
            content,
            memory_type: opts.type,
            tags: opts.tags ? opts.tags.split(',') : [],
            namespace: opts.namespace,
          },
        });
        spinner.succeed('Memory added');
        console.log(chalk.dim(`  ID: ${result.memory.id}`));
        console.log(chalk.dim(`  Type: ${result.memory.memoryType}`));
        console.log(`  ${chalk.green(content)}`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  memory
    .command('get <id>')
    .description('Get a memory by ID')
    .action(async (id: string) => {
      const spinner = ora('Fetching...').start();
      try {
        const client = createCLIClient();
        const result = await client.request<{ memory: Record<string, unknown> }>(`/memories/${id}`);
        spinner.stop();
        const m = result.memory;
        console.log(chalk.bold(m.content as string));
        console.log(chalk.dim(`  ID: ${m.id}`));
        console.log(chalk.dim(`  Type: ${m.memoryType}`));
        console.log(chalk.dim(`  Tags: ${(m.tags as string[])?.join(', ') || 'none'}`));
        console.log(chalk.dim(`  Created: ${m.createdAt}`));
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  memory
    .command('update <id>')
    .description('Update a memory')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('--importance <n>', 'Importance (0-10)')
    .option('-t, --type <type>', 'Memory type')
    .action(async (id: string, opts) => {
      const spinner = ora('Updating...').start();
      try {
        const client = createCLIClient();
        const body: Record<string, unknown> = {};
        if (opts.tags) body.tags = opts.tags.split(',');
        if (opts.importance) body.importance = parseInt(opts.importance, 10);
        if (opts.type) body.memory_type = opts.type;

        await client.request(`/memories/${id}`, { method: 'PUT', body });
        spinner.succeed(`Memory ${id} updated`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  memory
    .command('delete <id>')
    .description('Delete a memory')
    .action(async (id: string) => {
      const spinner = ora('Deleting...').start();
      try {
        const client = createCLIClient();
        await client.request(`/memories?ids=${id}`, { method: 'DELETE' });
        spinner.succeed(`Memory ${id} deleted`);
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  memory
    .command('list')
    .description('List recent memories')
    .option('-l, --limit <n>', 'Maximum results', '20')
    .option('-n, --namespace <ns>', 'Namespace')
    .action(async (opts) => {
      const spinner = ora('Fetching memories...').start();
      try {
        const client = createCLIClient();
        const params: Record<string, string> = { limit: opts.limit };
        if (opts.namespace) params.namespace = opts.namespace;

        const result = await client.request<{ memories: Array<Record<string, unknown>>; count: number }>(
          '/memories/list',
          { params }
        );
        spinner.stop();
        console.log(chalk.bold(`${result.count} memories found\n`));
        for (const m of result.memories) {
          const type = chalk.cyan(`[${m.memoryType}]`);
          const id = chalk.dim(String(m.id).slice(0, 8));
          console.log(`  ${id} ${type} ${m.content}`);
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  memory
    .command('stats')
    .description('Get memory statistics')
    .action(async () => {
      const spinner = ora('Fetching stats...').start();
      try {
        const client = createCLIClient();
        const stats = await client.request<Record<string, unknown>>('/memories/stats');
        spinner.stop();
        console.log(chalk.bold('Memory Statistics\n'));
        for (const [key, value] of Object.entries(stats)) {
          if (key === 'success') continue;
          if (typeof value === 'object' && value !== null) {
            console.log(`  ${chalk.cyan(key)}:`);
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
              console.log(`    ${k}: ${chalk.green(String(v))}`);
            }
          } else {
            console.log(`  ${chalk.cyan(key)}: ${chalk.green(String(value))}`);
          }
        }
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return memory;
}
