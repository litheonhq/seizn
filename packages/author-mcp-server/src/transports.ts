import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createSeiznAuthorMcpServer, type CreateServerOptions } from './server.js';

export type SeiznAuthorMcpTransport = 'stdio' | 'sse' | 'streamable-http';
export type SeiznAuthorCliMcpTransport = SeiznAuthorMcpTransport | 'streamable';

export interface SeiznAuthorMcpHttpServerOptions extends CreateServerOptions {
  transport: Exclude<SeiznAuthorMcpTransport, 'stdio'>;
  host?: string;
  mcpPath?: string;
  ssePath?: string;
  sseMessagePath?: string;
}

export function normalizeMcpTransport(value: string | undefined): SeiznAuthorMcpTransport {
  if (!value || value === 'streamable' || value === 'streamable-http') {
    return 'streamable-http';
  }
  if (value === 'stdio' || value === 'sse') {
    return value;
  }
  throw new Error(`Unsupported MCP transport: ${value}`);
}

export function createSeiznAuthorStdioTransport(
  stdin?: Readable,
  stdout?: Writable,
): StdioServerTransport {
  return new StdioServerTransport(stdin, stdout);
}

export async function createSeiznAuthorMcpHttpServer(
  options: SeiznAuthorMcpHttpServerOptions,
): Promise<Server> {
  return options.transport === 'sse'
    ? createSseServer(options)
    : createStreamableHttpServer(options);
}

async function createStreamableHttpServer(
  options: SeiznAuthorMcpHttpServerOptions,
): Promise<Server> {
  const mcpPath = options.mcpPath ?? '/mcp';
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  const mcpServer = createSeiznAuthorMcpServer(options);
  await mcpServer.connect(transport);

  return createServer(async (request, response) => {
    if (handleHealth(request, response)) return;

    const url = new URL(request.url ?? '/', `http://${options.host ?? '127.0.0.1'}`);
    if (url.pathname !== mcpPath) {
      sendJson(response, 404, {
        error: { message: `MCP Streamable HTTP endpoint is ${mcpPath}` },
      });
      return;
    }

    try {
      await transport.handleRequest(request, response);
    } catch (error) {
      sendJson(response, 500, {
        error: { message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
}

async function createSseServer(
  options: SeiznAuthorMcpHttpServerOptions,
): Promise<Server> {
  const ssePath = options.ssePath ?? '/sse';
  const messagePath = options.sseMessagePath ?? '/messages';
  const transports = new Map<string, SSEServerTransport>();

  return createServer(async (request, response) => {
    if (handleHealth(request, response)) return;

    const url = new URL(request.url ?? '/', `http://${options.host ?? '127.0.0.1'}`);

    if (request.method === 'GET' && url.pathname === ssePath) {
      const transport = new SSEServerTransport(messagePath, response);
      transports.set(transport.sessionId, transport);
      transport.onclose = () => {
        transports.delete(transport.sessionId);
      };

      const mcpServer = createSeiznAuthorMcpServer(options);
      await mcpServer.connect(transport);
      return;
    }

    if (request.method === 'POST' && url.pathname === messagePath) {
      const sessionId = url.searchParams.get('sessionId');
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        sendJson(response, 404, {
          error: { message: 'Unknown or missing MCP SSE sessionId' },
        });
        return;
      }
      await transport.handlePostMessage(request, response);
      return;
    }

    sendJson(response, 404, {
      error: { message: `MCP SSE endpoints are ${ssePath} and ${messagePath}` },
    });
  });
}

function handleHealth(request: IncomingMessage, response: ServerResponse): boolean {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, { status: 'ok' });
    return true;
  }
  return false;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload, null, 2));
}
