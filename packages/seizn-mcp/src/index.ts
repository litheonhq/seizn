#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SeiznApiClient } from "./client.js";
import { dispatchTool, tools } from "./tools/index.js";

const server = new Server(
  {
    name: "@seizn/mcp",
    version: "0.9.0-beta.1",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const client = new SeiznApiClient();

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await dispatchTool(client, request.params.name, request.params.arguments);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: false,
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
});

await server.connect(new StdioServerTransport());
