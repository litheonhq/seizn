import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { SeiznApiClient } from "../client.js";
import { asRecord, type SeiznTool } from "./common.js";
import { canonCheckTool } from "./canon-check.js";
import { canonListTool } from "./canon-list.js";
import { chaosRunTool } from "./chaos-run.js";
import { memoryCreateTool } from "./memory-create.js";
import { memorySearchTool } from "./memory-search.js";
import { replayFetchTool } from "./replay-fetch.js";
import { storyHealthCurrentTool } from "./story-health-current.js";

const toolHandlers: SeiznTool[] = [
  memorySearchTool,
  memoryCreateTool,
  canonListTool,
  canonCheckTool,
  replayFetchTool,
  chaosRunTool,
  storyHealthCurrentTool,
];

export const tools: Tool[] = toolHandlers.map((tool) => tool.definition);

export async function dispatchTool(
  client: SeiznApiClient,
  name: string,
  args: unknown
): Promise<unknown> {
  const handler = toolHandlers.find((tool) => tool.definition.name === name);
  if (!handler) throw new Error(`Unknown Seizn MCP tool: ${name}`);
  return handler.handle(client, asRecord(args));
}
