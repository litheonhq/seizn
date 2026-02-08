/**
 * Config Commands
 *
 * seizn config set api-key <key>
 * seizn config set base-url <url>
 * seizn config show
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.seizn');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

interface SeiznConfig {
  api_key?: string;
  base_url?: string;
  default_namespace?: string;
}

async function loadConfig(): Promise<SeiznConfig> {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveConfig(config: SeiznConfig): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

export function createConfigCommand(): Command {
  const config = new Command('config').description('Manage CLI configuration');

  config
    .command('set <key> <value>')
    .description('Set a configuration value')
    .action(async (key: string, value: string) => {
      const validKeys = ['api-key', 'base-url', 'default-namespace'];
      if (!validKeys.includes(key)) {
        console.error(chalk.red(`Invalid key: ${key}`));
        console.error(chalk.dim(`Valid keys: ${validKeys.join(', ')}`));
        process.exit(1);
      }

      const cfg = await loadConfig();
      const configKey = key.replace(/-/g, '_') as keyof SeiznConfig;

      if (key === 'api-key') {
        cfg.api_key = value;
      } else if (key === 'base-url') {
        cfg.base_url = value;
      } else if (key === 'default-namespace') {
        cfg.default_namespace = value;
      }

      await saveConfig(cfg);
      console.log(chalk.green(`Set ${key} = ${key === 'api-key' ? value.slice(0, 8) + '...' : value}`));
    });

  config
    .command('show')
    .description('Show current configuration')
    .action(async () => {
      const cfg = await loadConfig();
      console.log(chalk.bold('Seizn Configuration\n'));
      console.log(`  ${chalk.cyan('Config file')}: ${CONFIG_FILE}`);
      console.log(`  ${chalk.cyan('API Key')}: ${cfg.api_key ? cfg.api_key.slice(0, 8) + '...' : chalk.dim('(not set, using SEIZN_API_KEY env)')}`);
      console.log(`  ${chalk.cyan('Base URL')}: ${cfg.base_url ?? chalk.dim('(default: https://www.seizn.com/api)')}`);
      console.log(`  ${chalk.cyan('Namespace')}: ${cfg.default_namespace ?? chalk.dim('default')}`);

      if (process.env.SEIZN_API_KEY) {
        console.log(chalk.dim(`\n  Note: SEIZN_API_KEY env var is set (takes priority)`));
      }
    });

  return config;
}
