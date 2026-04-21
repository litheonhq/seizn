import type { SeiznTool } from "./common.js";
import { numberInRange, optionalString, requiredString } from "./common.js";

export const memorySearchTool: SeiznTool = {
  definition: {
    name: "seizn.memory.search",
    description: "Search Seizn memories, optionally scoped to one NPC via npc_id.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        npc_id: { type: "string", description: "Optional NPC/agent id to filter memory recall." },
        namespace: { type: "string", description: "Optional Seizn memory namespace." },
        limit: { type: "number", minimum: 1, maximum: 50, default: 10 },
      },
      required: ["query"],
    },
  },
  async handle(client, args) {
    const query = requiredString(args, "query");
    const npcId = optionalString(args.npc_id ?? args.npcId);
    const namespace = optionalString(args.namespace);
    const limit = numberInRange(args.limit, 10, 1, 50);

    const response = await client.request("/api/v1/memories", {
      query: {
        query,
        mode: "hybrid",
        limit,
        namespace,
        agent_id: npcId,
      },
    });

    return { query, npc_id: npcId ?? null, response };
  },
};
