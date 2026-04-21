import type { SeiznTool } from "./common.js";
import { optionalString, requiredString } from "./common.js";

export const canonCheckTool: SeiznTool = {
  definition: {
    name: "seizn.canon.check",
    description: "Check proposed NPC content against active Seizn Canon Locks and return a structured verdict.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: { type: "string", description: "Optional NPC id for NPC-scoped locks." },
        proposed_content: { type: "string", description: "Text to validate against Canon Locks." },
      },
      required: ["proposed_content"],
    },
  },
  async handle(client, args) {
    const proposedContent = requiredString(args, "proposed_content");
    const npcId = optionalString(args.npc_id ?? args.npcId);
    return client.request("/api/canon/check", {
      method: "POST",
      body: {
        npc_id: npcId,
        proposed_content: proposedContent,
      },
    });
  },
};
