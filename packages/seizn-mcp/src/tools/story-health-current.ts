import type { SeiznTool } from "./common.js";
import { numberInRange, optionalString } from "./common.js";

export const storyHealthCurrentTool: SeiznTool = {
  definition: {
    name: "seizn.story_health.current",
    description: "Fetch current Story Health snapshots, optionally scoped to one act.",
    inputSchema: {
      type: "object",
      properties: {
        act: { type: "string", description: "Optional act/chapter id." },
        limit: { type: "number", minimum: 1, maximum: 180, default: 30 },
      },
    },
  },
  async handle(client, args) {
    return client.request("/api/story-health/current", {
      query: {
        act: optionalString(args.act),
        limit: numberInRange(args.limit, 30, 1, 180),
      },
    });
  },
};
