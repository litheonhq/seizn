import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const requireFromHere = createRequire(import.meta.url);

export function loadLocalEnv(metaUrl) {
  let dotenv;
  try {
    dotenv = requireFromHere('dotenv');
  } catch {
    return;
  }
  const currentDir = dirname(fileURLToPath(metaUrl));
  dotenv.config({
    path: process.env.SEIZN_ENV_FILE || resolve(currentDir, '../.env.local'),
    override: true,
  });
}
