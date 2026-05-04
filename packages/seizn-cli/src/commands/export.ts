import { exportAll } from "../api.js";

export interface ExportOptions {
  format?: "json" | "ndjson";
  agentId?: string;
  scope?: string;
  baseUrl?: string;
}

export async function runExport(opts: ExportOptions): Promise<void> {
  const memories = await exportAll(
    {
      format: opts.format,
      agent_id: opts.agentId,
      scope: opts.scope,
    },
    opts.baseUrl
  );

  if (opts.format === "ndjson") {
    for (const m of memories) {
      console.log(JSON.stringify(m));
    }
  } else {
    console.log(JSON.stringify(memories, null, 2));
  }
}
