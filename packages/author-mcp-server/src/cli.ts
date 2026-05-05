#!/usr/bin/env node
import { createSeiznAuthorMcpServer } from './server.js';
import { createSeiznAuthorStdioTransport } from './transports.js';

async function main(): Promise<void> {
  const server = createSeiznAuthorMcpServer();
  await server.connect(createSeiznAuthorStdioTransport());
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
