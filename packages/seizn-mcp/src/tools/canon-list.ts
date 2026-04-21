import type { SeiznTool } from "./common.js";
import { optionalString } from "./common.js";

function filterLocks(response: unknown, npcId: string | undefined) {
  if (!npcId || !response || typeof response !== "object") return response;
  const record = response as Record<string, unknown>;
  const data = record.data;
  if (!data || typeof data !== "object") return response;
  const dataRecord = data as Record<string, unknown>;
  const locks = dataRecord.locks;
  if (!Array.isArray(locks)) return response;

  return {
    ...record,
    data: {
      ...dataRecord,
      locks: locks.filter((lock) => {
        if (!lock || typeof lock !== "object") return false;
        const lockRecord = lock as Record<string, unknown>;
        return lockRecord.npcId === null || lockRecord.npcId === undefined || lockRecord.npcId === npcId;
      }),
    },
  };
}

export const canonListTool: SeiznTool = {
  definition: {
    name: "seizn.canon.list",
    description: "List Canon Lock rules and recent violations, optionally filtered to an NPC.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: { type: "string", description: "Optional NPC id to filter returned locks." },
      },
    },
  },
  async handle(client, args) {
    const npcId = optionalString(args.npc_id ?? args.npcId);
    const response = await client.request("/api/canon/locks");
    return filterLocks(response, npcId);
  },
};
