import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export function loadLocalEnv(metaUrl) {
  const currentDir = dirname(fileURLToPath(metaUrl));
  config({
    path: process.env.SEIZN_ENV_FILE || resolve(currentDir, '../.env.local'),
    override: true,
  });
}
