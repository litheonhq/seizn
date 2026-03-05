import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const bin = process.execPath;
const args = [
  resolve(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs'),
  'run',
  'src/__tests__/security/llm-top10/',
];

const result = spawnSync(bin, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    SECURITY_STRICT_MODE: 'true',
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
