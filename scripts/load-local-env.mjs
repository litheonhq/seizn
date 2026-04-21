import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

export function loadLocalEnv(metaUrl) {
  const currentDir = dirname(fileURLToPath(metaUrl));
  config({
    path: resolve(currentDir, '../.env.local'),
    override: false,
  });
}
