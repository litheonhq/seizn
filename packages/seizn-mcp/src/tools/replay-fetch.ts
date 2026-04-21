import type { SeiznTool } from "./common.js";
import { requiredString } from "./common.js";

export const replayFetchTool: SeiznTool = {
  definition: {
    name: "seizn.replay.fetch",
    description: "Fetch a deterministic replay snapshot by session or trace id.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Replay session/trace id." },
      },
      required: ["session_id"],
    },
  },
  async handle(client, args) {
    const sessionId = requiredString(args, "session_id");
    return client.request(`/api/v1/replay/${encodeURIComponent(sessionId)}`);
  },
};
