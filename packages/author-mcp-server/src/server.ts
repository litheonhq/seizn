import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { SeiznAuthorClient, SeiznApiError, type SeiznClientConfig } from './api-client.js';

export const SEIZN_AUTHOR_MCP_TOOLS = [
  'seizn_author_recall',
  'seizn_author_check',
  'seizn_author_remember',
  'seizn_author_search',
  'seizn_author_timeline',
  'seizn_author_graph',
] as const;

export type SeiznAuthorMcpToolName = (typeof SEIZN_AUTHOR_MCP_TOOLS)[number];

export interface CreateServerOptions extends Partial<SeiznClientConfig> {
  apiKey?: string;
}

export function listSeiznAuthorMcpTools(): SeiznAuthorMcpToolName[] {
  return [...SEIZN_AUTHOR_MCP_TOOLS];
}

export function createSeiznAuthorMcpServer(
  options: CreateServerOptions = {},
): McpServer {
  const apiKey = options.apiKey ?? process.env.SEIZN_API_KEY;
  if (!apiKey) {
    throw new Error(
      'SEIZN_API_KEY is required. Set the SEIZN_API_KEY env var or pass apiKey in options. Generate a key at https://seizn.com/dashboard/account/api-keys',
    );
  }

  const client = new SeiznAuthorClient({
    apiKey,
    baseUrl: options.baseUrl ?? process.env.SEIZN_API_BASE_URL,
    fetch: options.fetch,
  });

  const server = new McpServer({
    name: '@seizn/author-mcp-server',
    version: '0.1.1',
  });

  registerSeiznAuthorTools(server, client);
  return server;
}

export function registerSeiznAuthorTools(
  server: McpServer,
  client: SeiznAuthorClient,
): void {
  const projectIdSchema = z
    .string()
    .min(1)
    .describe('Seizn project id (find in dashboard URL or via list_projects API)');

  server.registerTool(
    'seizn_author_recall',
    {
      title: 'Seizn Author — Recall',
      description:
        'Recall canon facts for a named entity (character / location / object / rule / promise / event). Returns the canonical name, last 3 mentions with chapter snippets, current state, and any pending conflicts. Use this when the user asks about a name they wrote earlier and may have forgotten.',
      inputSchema: {
        projectId: projectIdSchema,
        name: z
          .string()
          .min(1)
          .describe('Entity name to recall (e.g. character name, place name)'),
      },
    },
    async (args) => {
      const entities = await client.recall(args.projectId, args.name);
      return toolTextResponse(
        entities.length === 0
          ? `No canon entries found for '${args.name}' in project ${args.projectId}.`
          : entities
              .map((e) => formatRecallEntity(e))
              .join('\n\n---\n\n'),
        { entities },
      );
    },
  );

  server.registerTool(
    'seizn_author_check',
    {
      title: 'Seizn Author — Conflict check',
      description:
        'Check a passage of prose for canon conflicts (character contradictions, timeline issues, broken promises, rule violations). Returns conflicts with severity (P1 critical, P2 warning, P3 stylistic) and rationale. Use this on a finished scene before committing to draft.',
      inputSchema: {
        projectId: projectIdSchema,
        text: z
          .string()
          .min(1)
          .describe('Passage of prose to check (single scene or chapter recommended; ~500-5000 chars optimal)'),
      },
    },
    async (args) => {
      const conflicts = await client.check(args.projectId, args.text);
      return toolTextResponse(
        conflicts.length === 0
          ? 'No conflicts detected.'
          : conflicts.map((c) => formatConflict(c)).join('\n\n---\n\n'),
        { conflicts },
      );
    },
  );

  server.registerTool(
    'seizn_author_remember',
    {
      title: 'Seizn Author — Remember (approve canon fact)',
      description:
        'Approve a fact as canon for an existing entity. Use when the user confirms an AI-suggested fact ("yes Seoyun is a reporter as of Ch.4") or when adding a new canonical fact mid-conversation. The fact becomes the source of truth for future recall and conflict checks.',
      inputSchema: {
        projectId: projectIdSchema,
        entityId: z.string().min(1).describe('Entity id (from a prior recall result)'),
        fact: z.string().min(1).describe('Canon fact to record (e.g. "Seoyun works as a reporter at the Daily as of Ch.4 §3")'),
      },
    },
    async (args) => {
      const result = await client.remember(args.projectId, args.entityId, args.fact);
      return toolTextResponse(
        `Recorded canon fact for entity ${result.entityId} (status: ${result.status}).`,
        result,
      );
    },
  );

  server.registerTool(
    'seizn_author_search',
    {
      title: 'Seizn Author — Semantic search',
      description:
        'Semantic search across all entities in a project. Use when the user asks about a concept rather than a specific name (e.g. "what happens at the temple in chapters 3-7", "characters with grief arcs"). Returns entities ranked by semantic relevance.',
      inputSchema: {
        projectId: projectIdSchema,
        query: z.string().min(1).describe('Natural-language search query'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Max results to return (default 20)'),
      },
    },
    async (args) => {
      const entities = await client.search(args.projectId, args.query, args.limit);
      return toolTextResponse(
        entities.length === 0
          ? `No entities matched '${args.query}'.`
          : entities.map((e) => formatRecallEntity(e)).join('\n\n---\n\n'),
        { entities },
      );
    },
  );

  server.registerTool(
    'seizn_author_timeline',
    {
      title: 'Seizn Author — Timeline',
      description:
        'Return chapter-by-chapter beats for the project, optionally filtered by chapter range. Use when the user asks "what happened between Ch.5 and Ch.7" or needs to see story progression.',
      inputSchema: {
        projectId: projectIdSchema,
        from: z.string().optional().describe('Start chapter id (e.g. "ch4"), inclusive'),
        to: z.string().optional().describe('End chapter id (e.g. "ch7"), inclusive'),
      },
    },
    async (args) => {
      const timeline = await client.timeline(args.projectId, args.from, args.to);
      return toolTextResponse(
        timeline.length === 0
          ? 'Timeline is empty for the requested range.'
          : timeline.map((entry) => formatTimelineEntry(entry)).join('\n\n'),
        { timeline },
      );
    },
  );

  server.registerTool(
    'seizn_author_graph',
    {
      title: 'Seizn Author — Relationship graph',
      description:
        'Return a relationship graph subset rooted at a given entity. Includes direct ties (1-hop) and indirect (2-hop) with edge kinds (rival, ally, family, etc). Use for character-relationship questions like "who is Seoyun connected to".',
      inputSchema: {
        projectId: projectIdSchema,
        entityId: z.string().min(1).describe('Root entity id (typically a character)'),
      },
    },
    async (args) => {
      const subset = await client.graph(args.projectId, args.entityId);
      return toolTextResponse(formatGraphSubset(subset), subset);
    },
  );
}

function toolTextResponse(text: string, structured: unknown) {
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured as Record<string, unknown>,
  };
}

function formatRecallEntity(entity: {
  canonicalName: string;
  type: string;
  approvalStatus: string;
  currentState: Record<string, unknown> | null;
  lastMentions: Array<{ chapter: string; line: number; snippet: string }>;
  pendingConflictIds: string[];
}): string {
  const lines = [
    `**${entity.canonicalName}** (${entity.type}, ${entity.approvalStatus})`,
  ];
  if (entity.currentState && Object.keys(entity.currentState).length > 0) {
    lines.push(`Current state: ${JSON.stringify(entity.currentState)}`);
  }
  if (entity.lastMentions.length > 0) {
    lines.push('Recent mentions:');
    for (const mention of entity.lastMentions.slice(0, 3)) {
      lines.push(`  - ${mention.chapter}:${mention.line} — '${mention.snippet}'`);
    }
  }
  if (entity.pendingConflictIds.length > 0) {
    lines.push(`Pending conflicts: ${entity.pendingConflictIds.length}`);
  }
  return lines.join('\n');
}

function formatConflict(c: {
  severity: string;
  kind: string;
  episode: string | null;
  title: string;
  rationale: string;
  refs: string[];
}): string {
  const head = `[${c.severity}] ${c.kind}${c.episode ? ` · ${c.episode}` : ''} — ${c.title}`;
  return `${head}\n${c.rationale}${c.refs.length > 0 ? `\nrefs: ${c.refs.join(', ')}` : ''}`;
}

function formatTimelineEntry(entry: {
  chapter: string;
  ordinal: number;
  beats: Array<{ id: string; summary: string; entities: string[] }>;
}): string {
  const lines = [`### ${entry.chapter} (#${entry.ordinal})`];
  for (const beat of entry.beats) {
    const ent = beat.entities.length > 0 ? ` (${beat.entities.join(', ')})` : '';
    lines.push(`  - ${beat.summary}${ent}`);
  }
  return lines.join('\n');
}

function formatGraphSubset(subset: {
  nodes: Array<{ id: string; label: string; type: string }>;
  edges: Array<{ from: string; to: string; kind: string; weight: number }>;
}): string {
  const lines = [`Nodes (${subset.nodes.length}):`];
  for (const node of subset.nodes) {
    lines.push(`  - ${node.label} [${node.type}] (${node.id})`);
  }
  lines.push('', `Edges (${subset.edges.length}):`);
  for (const edge of subset.edges) {
    lines.push(`  - ${edge.from} —${edge.kind} (${edge.weight.toFixed(2)})→ ${edge.to}`);
  }
  return lines.join('\n');
}

export { SeiznApiError };
