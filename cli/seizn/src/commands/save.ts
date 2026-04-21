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
import { readFile, writeFile } from 'node:fs/promises';
import { SeiznApiClient } from '../api.js';
import { createCLIClient } from '../client.js';
import type { GlobalOptions } from '../types.js';

export function createSaveCommand(): Command {
  const save = new Command('save')
    .description('Quick-save a memory or move portable .szs save files')
    .argument('<content>', 'Memory content (use "-" to read from stdin)')
    .option('-t, --type <type>', 'Memory type (fact, preference, experience, relationship, instruction)', 'fact')
    .option('--tags <tags>', 'Comma-separated tags')
    .option('-n, --namespace <ns>', 'Namespace', 'default')
    .option('-q, --quiet', 'Quiet mode: print only the memory ID')
    .action(async (content: string, opts: any) => {
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
          data: { memory: { id: string }; deduplicated?: boolean };
        }>('/v1/memories', {
          method: 'POST',
          body: {
            content,
            memory_type: opts.type,
            tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : [],
            namespace: opts.namespace,
            source: 'cli',
          },
        });

        const memoryId = result.data.memory.id;
        const deduped = result.data.deduplicated;

        if (opts.quiet) {
          console.log(memoryId);
        } else {
          spinner?.succeed(deduped ? 'Memory already exists (deduplicated)' : 'Memory saved');
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

  save
    .command('export')
    .description('Export one NPC state as a signed .szs save file')
    .argument('<npc-id>', 'NPC/entity id to export')
    .argument('<out.szs>', 'Output save-file path')
    .action(async (npcId: string, outFile: string, _options: unknown, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const spinner = ora(`Exporting ${npcId}...`).start();

      try {
        const client = await SeiznApiClient.create(globals);
        const file = await client.exportSaveFile(npcId);
        await writeFile(outFile, file);
        spinner.succeed(`Exported signed save file to ${chalk.green(outFile)}`);
        console.log(chalk.dim(`  NPC: ${npcId}`));
        console.log(chalk.dim(`  Bytes: ${file.length}`));
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  save
    .command('import')
    .description('Import memories, beliefs, and canon locks from a signed .szs save file')
    .argument('<in.szs>', 'Input save-file path')
    .action(async (inFile: string, _options: unknown, command: Command) => {
      const globals = command.optsWithGlobals() as GlobalOptions;
      const spinner = ora(`Importing ${inFile}...`).start();

      try {
        const client = await SeiznApiClient.create(globals);
        const file = await readFile(inFile);
        const result = await client.importSaveFile(file);
        spinner.succeed(`Imported save file for ${chalk.green(result.npcId)}`);
        console.log(chalk.dim(`  Memories: ${result.imported.memories}`));
        console.log(chalk.dim(`  Beliefs: ${result.imported.beliefs}`));
        console.log(chalk.dim(`  Canon locks: ${result.imported.canonLocks}`));
      } catch (error) {
        spinner.fail(`Failed: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  return save;
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
