/**
 * Quick Save Command
 *
 * seizn save "User prefers dark mode"
 * seizn save "..." --tags preference,ui
 * seizn save "..." --type preference
 * seizn save "..." -q          (quiet: prints ID only)
 * echo "content" | seizn save -
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createCLIClient } from '../client.js';

export function createSaveCommand(): Command {
  const save = new Command('save')
    .description('Quick-save a memory (shorthand for `seizn memory add`)')
    .argument('<content>', 'Memory content (use "-" to read from stdin)')
    .option('-t, --type <type>', 'Memory type (fact, preference, experience, relationship, instruction)', 'fact')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-n, --namespace <ns>', 'Namespace', 'default')
    .option('-q, --quiet', 'Quiet mode: print only the memory ID')
    .action(async (content: string, opts) => {
      // Read from stdin if content is "-"
      if (content === '-') {
        content = await readStdin();
        if (!content.trim()) {
          console.error(chalk.red('Error: No content received from stdin'));
          process.exit(1);
        }
      }

      const spinner = opts.quiet ? null : ora('Saving memory...').start();

      try {
        const client = createCLIClient();
        const result = await client.request<{
          success: boolean;
          memory?: { id: string };
          data?: { memory: { id: string } };
        }>('/memories', {
          method: 'POST',
          body: {
            content,
            memory_type: opts.type,
            tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [],
            namespace: opts.namespace,
            source: 'cli',
          },
        });

        const memoryId = result.data?.memory?.id || result.memory?.id;

        if (opts.quiet) {
          // Print only the ID for scripting
          console.log(memoryId);
        } else {
          spinner?.succeed('Memory saved');
          console.log(chalk.dim(`  ID: ${memoryId}`));
          console.log(chalk.dim(`  Type: ${opts.type}`));
          if (opts.tags) console.log(chalk.dim(`  Tags: ${opts.tags}`));
          console.log(`  ${chalk.green(content.length > 100 ? content.slice(0, 100) + '...' : content)}`);
        }
      } catch (error) {
        if (opts.quiet) {
          process.exit(1);
        }
        spinner?.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return save;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.resume();
  });
}
