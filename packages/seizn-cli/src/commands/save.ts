import { save } from "../api.js";

export interface SaveOptions {
  tags?: string;
  agentId?: string;
  scope?: string;
  autoScore?: boolean;
  noDedup?: boolean;
  baseUrl?: string;
}

export async function runSave(content: string, opts: SaveOptions): Promise<void> {
  const tags = opts.tags ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
  const memory = await save(
    {
      content,
      tags,
      agent_id: opts.agentId,
      scope: opts.scope,
      auto_score: opts.autoScore,
      dedup: opts.noDedup ? false : undefined,
    },
    opts.baseUrl
  );
  console.log(`Saved ${memory.id}`);
  if (memory.tags.length) {
    console.log(`  tags: ${memory.tags.join(", ")}`);
  }
  if (memory.importance !== undefined) {
    console.log(`  importance: ${memory.importance}`);
  }
}
