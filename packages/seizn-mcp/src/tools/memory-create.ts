import type { SeiznTool } from "./common.js";
import {
  objectOrUndefined,
  optionalString,
  requiredString,
  stringArray,
} from "./common.js";

const memoryTypes = ["fact", "preference", "experience", "relationship", "instruction"] as const;

function normalizeMemoryType(value: unknown) {
  const raw = optionalString(value);
  return raw && (memoryTypes as readonly string[]).includes(raw) ? raw : "fact";
}

export const memoryCreateTool: SeiznTool = {
  definition: {
    name: "seizn.memory.create",
    description: "Create a Seizn memory for an NPC/agent.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: { type: "string", description: "NPC/agent id that owns this memory." },
        content: { type: "string", description: "Memory content to store." },
        metadata: { type: "object", description: "Optional metadata preserved in the MCP response." },
        memory_type: {
          type: "string",
          enum: [...memoryTypes],
          default: "fact",
        },
        namespace: { type: "string", description: "Optional memory namespace." },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["npc_id", "content"],
    },
  },
  async handle(client, args) {
    const npcId = requiredString(args, "npc_id");
    const content = requiredString(args, "content");
    const metadata = objectOrUndefined(args.metadata);

    const response = await client.request("/api/v1/memories", {
      method: "POST",
      body: {
        content,
        memory_type: normalizeMemoryType(args.memory_type ?? args.memoryType),
        namespace: optionalString(args.namespace) ?? "default",
        tags: stringArray(args.tags) ?? [],
        scope: "agent",
        agent_id: npcId,
        entity_id: npcId,
        source: "mcp",
        metadata,
      },
    });

    return { npc_id: npcId, metadata: metadata ?? null, response };
  },
};
