import { search } from "../api.js";

export interface SearchOptions {
  mode?: "hybrid" | "vector" | "lexical";
  limit?: string;
  agentId?: string;
  scope?: string;
  json?: boolean;
  baseUrl?: string;
}

export async function runSearch(query: string, opts: SearchOptions): Promise<void> {
  const limit = opts.limit ? parseInt(opts.limit, 10) : undefined;
  const memories = await search(
    {
      query,
      mode: opts.mode,
      limit,
      agent_id: opts.agentId,
      scope: opts.scope,
    },
    opts.baseUrl
  );

  if (opts.json) {
    console.log(JSON.stringify(memories, null, 2));
    return;
  }

  if (memories.length === 0) {
    console.log("No memories matched.");
    return;
  }

  for (const m of memories) {
    console.log(`${m.id}  ${m.created_at}`);
    console.log(`  ${m.content.replace(/\n/g, " ").slice(0, 160)}`);
    if (m.tags.length) {
      console.log(`  tags: ${m.tags.join(", ")}`);
    }
    console.log();
  }
}
