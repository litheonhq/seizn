import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";

type FramingMode = "content-length" | "newline";

function createMcpHarness(mode: FramingMode) {
  const scriptPath = path.resolve(process.cwd(), "mcp-server", "dist", "index.js");
  const child = spawn(process.execPath, [scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      SEIZN_API_KEY: process.env.SEIZN_API_KEY ?? "",
    },
  });

  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();

  const rejectAll = (error: Error) => {
    for (const [id, pendingRequest] of pending.entries()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(error);
      pending.delete(id);
    }
  };

  const processBuffer = () => {
    while (true) {
      if (mode === "content-length") {
        const headerEnd = buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) return;
        const header = buffer.slice(0, headerEnd).toString("utf8");
        const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
        if (!lengthMatch) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        const contentLength = Number(lengthMatch[1]);
        const messageStart = headerEnd + 4;
        const messageEnd = messageStart + contentLength;
        if (buffer.length < messageEnd) return;
        const raw = buffer.slice(messageStart, messageEnd).toString("utf8");
        buffer = buffer.slice(messageEnd);
        handleMessage(raw);
        continue;
      }

      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      const raw = buffer.slice(0, newlineIndex).toString("utf8").replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      if (!raw.trim()) {
        continue;
      }
      handleMessage(raw);
    }
  };

  const handleMessage = (raw: string) => {
    const message = JSON.parse(raw) as { id?: number; error?: unknown; result?: unknown };
    if (typeof message.id !== "number") {
      return;
    }
    const pendingRequest = pending.get(message.id);
    if (!pendingRequest) {
      return;
    }
    clearTimeout(pendingRequest.timer);
    pending.delete(message.id);
    if (message.error) {
      pendingRequest.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    pendingRequest.resolve(message.result);
  };

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processBuffer();
  });
  child.on("exit", (code, signal) => {
    rejectAll(new Error(`mcp-server exited unexpectedly (code=${code}, signal=${signal})`));
  });

  const send = (message: unknown) => {
    const json = JSON.stringify(message);
    const payload =
      mode === "content-length"
        ? `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`
        : `${json}\n`;
    child.stdin.write(payload);
  };

  const request = (method: string, params: Record<string, unknown> = {}) => {
    const id = nextId++;
    send({ jsonrpc: "2.0", id, method, params });
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method} via ${mode}`));
      }, 10000);
      pending.set(id, { resolve, reject, timer });
    });
  };

  return {
    child,
    async initialize() {
      const result = (await request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: `vitest-${mode}`, version: "1.0.0" },
      })) as {
        serverInfo?: { name?: string; version?: string };
      };
      send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      return result;
    },
    request,
    close() {
      rejectAll(new Error("Harness closed"));
      child.kill();
    },
  };
}

const harnesses: Array<{ close: () => void }> = [];

afterEach(() => {
  while (harnesses.length > 0) {
    harnesses.pop()?.close();
  }
});

describe("seizn mcp stdio transport", () => {
  it("supports content-length framed MCP clients", async () => {
    const harness = createMcpHarness("content-length");
    harnesses.push(harness);

    const initializeResult = await harness.initialize();
    expect(initializeResult.serverInfo?.name).toBe("seizn-memory");

    const toolsList = (await harness.request("tools/list")) as { tools?: unknown[] };
    const resourcesList = (await harness.request("resources/list")) as { resources?: unknown[] };

    expect(Array.isArray(toolsList.tools)).toBe(true);
    expect(toolsList.tools?.length).toBeGreaterThan(0);
    expect(Array.isArray(resourcesList.resources)).toBe(true);
    expect(resourcesList.resources?.length).toBeGreaterThan(0);
  });

  it("supports newline-delimited MCP clients", async () => {
    const harness = createMcpHarness("newline");
    harnesses.push(harness);

    const initializeResult = await harness.initialize();
    expect(initializeResult.serverInfo?.version).toBe("3.0.0");

    const resourcesList = (await harness.request("resources/list")) as { resources?: unknown[] };
    const templatesList = (await harness.request("resources/templates/list")) as {
      resourceTemplates?: unknown[];
    };

    expect(Array.isArray(resourcesList.resources)).toBe(true);
    expect(resourcesList.resources?.length).toBeGreaterThan(0);
    expect(Array.isArray(templatesList.resourceTemplates)).toBe(true);
    expect(templatesList.resourceTemplates?.length).toBeGreaterThan(0);
  });
});
