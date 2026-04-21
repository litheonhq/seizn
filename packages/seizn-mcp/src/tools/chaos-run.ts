import type { SeiznTool } from "./common.js";
import { numberInRange, optionalString, requiredString } from "./common.js";

function extractRunId(response: unknown): string | undefined {
  if (!response || typeof response !== "object") return undefined;
  const data = (response as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return undefined;
  const run = (data as Record<string, unknown>).run;
  if (!run || typeof run !== "object") return undefined;
  const id = (run as Record<string, unknown>).id;
  return typeof id === "string" ? id : undefined;
}

export const chaosRunTool: SeiznTool = {
  definition: {
    name: "seizn.chaos.run",
    description: "Create and execute a Seizn NPC Chaos Monkey run.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: { type: "string", description: "NPC id to test." },
        suite: { type: "string", description: "Chaos suite name.", default: "basic" },
        prompt_count: { type: "number", minimum: 1, maximum: 5000, default: 100 },
        target_endpoint: { type: "string", description: "Optional target endpoint override." },
      },
      required: ["npc_id"],
    },
  },
  async handle(client, args) {
    const npcId = requiredString(args, "npc_id");
    const created = await client.request("/api/chaos/runs", {
      method: "POST",
      body: {
        npc_id: npcId,
        suite: optionalString(args.suite) ?? "basic",
        prompt_count: numberInRange(args.prompt_count ?? args.promptCount, 100, 1, 5000),
        target_endpoint: optionalString(args.target_endpoint ?? args.targetEndpoint),
      },
    });

    const runId = extractRunId(created);
    const executed = runId
      ? await client.request(`/api/chaos/runs/${encodeURIComponent(runId)}`, { method: "POST" })
      : null;

    return { created, executed };
  },
};
