#!/usr/bin/env node

// Force UTF-8 encoding for Windows compatibility
if (process.platform === 'win32') {
  const { execSync } = require('child_process');
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
}

// Ensure stdin uses UTF-8
process.stdin.setEncoding('utf8');

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";

// Configuration from environment
const SEIZN_API_URL = process.env.SEIZN_API_URL || "https://www.seizn.com";
const SEIZN_API_KEY = process.env.SEIZN_API_KEY || "";

if (!SEIZN_API_KEY) {
  console.error("Warning: SEIZN_API_KEY not set. API calls will fail.");
}

// Types
interface Memory {
  id: string;
  content: string;
  memory_type?: string;
  tags?: string[];
  namespace?: string;
  created_at?: string;
  similarity?: number;
}

interface Entity {
  name: string;
  entityType: string;
  observations: string[];
}

interface Relation {
  from: string;
  to: string;
  relationType: string;
}

// Content-Length framed transport (Claude/Codex clients expect this framing)
class ContentLengthStdioTransport {
  private buffer = Buffer.alloc(0);
  onmessage?: (message: unknown) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  constructor(
    private stdin: NodeJS.ReadStream = process.stdin,
    private stdout: NodeJS.WriteStream = process.stdout
  ) {}

  private handleError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    this.onerror?.(err);
  };

  private handleData = (chunk: Buffer | string) => {
    const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
    this.buffer = Buffer.concat([this.buffer, incoming]);
    this.processBuffer();
  };

  private processBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");

      // Fallback: accept bare newline-delimited JSON if no headers are present
      if (headerEnd === -1) {
        const newlineIndex = this.buffer.indexOf("\n");
        if (newlineIndex === -1) return;
        const line = this.buffer.slice(0, newlineIndex).toString("utf8").replace(/\r$/, "");
        this.buffer = this.buffer.slice(newlineIndex + 1);
        this.safeHandle(line);
        continue;
      }

      const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = Number(lengthMatch[1]);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) return;

      const jsonText = this.buffer.slice(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      this.safeHandle(jsonText);
    }
  }

  private safeHandle(raw: string) {
    try {
      const message = JSON.parse(raw);
      this.onmessage?.(message);
    } catch (error) {
      this.handleError(error);
    }
  }

  async start() {
    this.stdin.on("data", this.handleData);
    this.stdin.on("error", this.handleError);
  }

  async close() {
    this.stdin.off("data", this.handleData);
    this.stdin.off("error", this.handleError);
    if (this.stdin.listenerCount("data") === 0) {
      this.stdin.pause();
    }
    this.buffer = Buffer.alloc(0);
    this.onclose?.();
  }

  async send(message: unknown) {
    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
    await new Promise<void>((resolve) => {
      if (this.stdout.write(payload)) {
        resolve();
      } else {
        this.stdout.once("drain", () => resolve());
      }
    });
  }
}

// API Helper
async function apiRequest(
  endpoint: string,
  method: string = "GET",
  body?: unknown
): Promise<unknown> {
  const url = `${SEIZN_API_URL}${endpoint}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "x-api-key": SEIZN_API_KEY,
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// Tool definitions
const tools: Tool[] = [
  // =========================================================================
  // Context API Tools (Zep/Memobase style)
  // =========================================================================
  {
    name: "get_context",
    description: "Get formatted context string ready for LLM prompt injection. Supports multiple formats and includes user profile, facts, and recent messages.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["brief", "detailed", "extended"],
          description: "Context format: brief (~500 tokens), detailed (~1500 tokens), extended (~3000 tokens)"
        },
        query: {
          type: "string",
          description: "Optional query for relevance filtering"
        },
        includeProfile: {
          type: "boolean",
          description: "Include user profile summary (default: true)"
        },
        includeGraph: {
          type: "boolean",
          description: "Include graph relationships (default: false)"
        },
        tierStrategy: {
          type: "string",
          enum: ["hot_first", "balanced", "comprehensive"],
          description: "Memory tier retrieval strategy"
        },
        maxTokens: {
          type: "number",
          description: "Maximum tokens for context"
        }
      }
    }
  },
  {
    name: "flush_memories",
    description: "Immediately process pending memories: promote candidates, generate embeddings, create links, update profile.",
    inputSchema: {
      type: "object",
      properties: {
        processCandidates: {
          type: "boolean",
          description: "Process pending candidates (default: true)"
        },
        generateEmbeddings: {
          type: "boolean",
          description: "Generate missing embeddings (default: true)"
        },
        generateLinks: {
          type: "boolean",
          description: "Generate links between memories (default: true)"
        },
        updateProfile: {
          type: "boolean",
          description: "Update user profile (default: true)"
        },
        maxItems: {
          type: "number",
          description: "Maximum items to process per category (default: 50)"
        }
      }
    }
  },
  // =========================================================================
  // External Connector Tools
  // =========================================================================
  {
    name: "sync_connector",
    description: "Trigger synchronization from an external source (Google Drive, Notion, GitHub)",
    inputSchema: {
      type: "object",
      properties: {
        connectorType: {
          type: "string",
          enum: ["google_drive", "notion", "github"],
          description: "Type of connector to sync"
        },
        connectionId: {
          type: "string",
          description: "Optional specific connection ID to sync"
        },
        force: {
          type: "boolean",
          description: "Force re-sync even if content unchanged"
        }
      },
      required: ["connectorType"]
    }
  },
  {
    name: "list_connectors",
    description: "List available external connectors and their status",
    inputSchema: {
      type: "object",
      properties: {
        connectorType: {
          type: "string",
          enum: ["google_drive", "notion", "github"],
          description: "Optional filter by connector type"
        }
      }
    }
  },
  // =========================================================================
  // Knowledge Graph Tools (existing)
  // =========================================================================
  {
    name: "create_entities",
    description: "Create multiple new entities (memories) in Seizn. Each entity becomes a searchable memory.",
    inputSchema: {
      type: "object",
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "The name/title of the entity" },
              entityType: { type: "string", description: "The type of entity (e.g., Project, Person, Concept)" },
              observations: {
                type: "array",
                items: { type: "string" },
                description: "Array of observations/facts about this entity"
              }
            },
            required: ["name", "entityType", "observations"]
          },
          description: "Array of entities to create"
        }
      },
      required: ["entities"]
    }
  },
  {
    name: "create_relations",
    description: "Create relationships between entities in the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "Source entity name" },
              to: { type: "string", description: "Target entity name" },
              relationType: { type: "string", description: "Type of relationship (e.g., owns, uses, contains)" }
            },
            required: ["from", "to", "relationType"]
          },
          description: "Array of relations to create"
        }
      },
      required: ["relations"]
    }
  },
  {
    name: "add_observations",
    description: "Add new observations to existing entities",
    inputSchema: {
      type: "object",
      properties: {
        observations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string", description: "Name of the entity to add observations to" },
              contents: {
                type: "array",
                items: { type: "string" },
                description: "New observations to add"
              }
            },
            required: ["entityName", "contents"]
          }
        }
      },
      required: ["observations"]
    }
  },
  {
    name: "search_nodes",
    description: "Search for memories/entities in Seizn using semantic search",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Maximum results (default: 10)" },
        mode: {
          type: "string",
          enum: ["vector", "hybrid", "keyword"],
          description: "Search mode (default: vector)"
        }
      },
      required: ["query"]
    }
  },
  {
    name: "read_graph",
    description: "Read all entities and relations from the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Optional namespace filter" }
      }
    }
  },
  {
    name: "open_nodes",
    description: "Get specific entities by their names",
    inputSchema: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: { type: "string" },
          description: "Array of entity names to retrieve"
        }
      },
      required: ["names"]
    }
  },
  {
    name: "delete_entities",
    description: "Delete entities from the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        entityNames: {
          type: "array",
          items: { type: "string" },
          description: "Array of entity names to delete"
        }
      },
      required: ["entityNames"]
    }
  },
  {
    name: "delete_observations",
    description: "Delete specific observations from entities",
    inputSchema: {
      type: "object",
      properties: {
        deletions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              entityName: { type: "string" },
              observations: { type: "array", items: { type: "string" } }
            },
            required: ["entityName", "observations"]
          }
        }
      },
      required: ["deletions"]
    }
  },
  {
    name: "delete_relations",
    description: "Delete relations from the knowledge graph",
    inputSchema: {
      type: "object",
      properties: {
        relations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string" },
              to: { type: "string" },
              relationType: { type: "string" }
            },
            required: ["from", "to", "relationType"]
          }
        }
      },
      required: ["relations"]
    }
  },
  // =========================================================================
  // Profile API Tools (PR-021)
  // =========================================================================
  {
    name: "get_profile",
    description: "Get the user's structured profile including about_me, preferences, constraints, tools, and workstyle.",
    inputSchema: {
      type: "object",
      properties: {
        history: {
          type: "boolean",
          description: "If true, include version history (default: false)"
        }
      }
    }
  },
  {
    name: "update_profile",
    description: "Update the user's structured profile. Creates a new version preserving history.",
    inputSchema: {
      type: "object",
      properties: {
        aboutMe: { type: "string", description: "Brief paragraph about the user" },
        preferences: { type: "object", description: "Key-value pairs for user preferences" },
        constraints: { type: "array", items: { type: "string" }, description: "List of constraints or limitations" },
        tools: { type: "array", items: { type: "string" }, description: "Tools and technologies the user uses" },
        workstyle: { type: "string", description: "How the user prefers to work" },
        customFields: { type: "object", description: "Any other structured information" }
      }
    }
  },
  {
    name: "derive_profile",
    description: "Derive a structured profile from the user's memories using AI. Creates a new profile version based on stored memories.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  // =========================================================================
  // Diagnostics
  // =========================================================================
  {
    name: "health_check",
    description: "Check MCP server health, API connectivity, and version info. Use this to diagnose connection issues.",
    inputSchema: {
      type: "object",
      properties: {
        verbose: {
          type: "boolean",
          description: "Include detailed diagnostics (default: false)"
        }
      }
    }
  },
];

// Tool handlers
async function handleCreateEntities(entities: Entity[]): Promise<string> {
  const results = [];

  for (const entity of entities) {
    // Create a memory for each entity with all observations
    const content = `[${entity.entityType}] ${entity.name}\n\n${entity.observations.join("\n")}`;

    const response = await apiRequest("/api/memories", "POST", {
      content,
      memory_type: "fact",  // Valid type: fact, preference, experience, relationship, instruction
      tags: ["entity", entity.entityType, entity.name],
      namespace: "knowledge_graph",
      source: "mcp"
    }) as { success: boolean; memory: Memory };

    results.push({
      name: entity.name,
      type: entity.entityType,
      id: response.memory?.id
    });
  }

  return JSON.stringify({ success: true, created: results });
}

async function handleCreateRelations(relations: Relation[]): Promise<string> {
  // Store relations as memories with special format
  const results = [];

  for (const rel of relations) {
    const content = `[Relation] ${rel.from} --${rel.relationType}--> ${rel.to}`;

    const response = await apiRequest("/api/memories", "POST", {
      content,
      memory_type: "relationship",  // Valid type for relations
      tags: ["relation", rel.from, rel.to, rel.relationType],
      namespace: "knowledge_graph",
      source: "mcp"
    }) as { success: boolean; memory: Memory };

    results.push({
      from: rel.from,
      to: rel.to,
      type: rel.relationType,
      id: response.memory?.id
    });
  }

  return JSON.stringify({ success: true, created: results });
}

async function handleAddObservations(observations: { entityName: string; contents: string[] }[]): Promise<string> {
  const results = [];

  for (const obs of observations) {
    // First search for the entity
    const searchResponse = await apiRequest(
      `/api/memories?query=${encodeURIComponent(obs.entityName)}&limit=1&mode=hybrid`
    ) as { results: Memory[] };

    if (searchResponse.results && searchResponse.results.length > 0) {
      // Add new observations as new memories linked to the entity
      for (const content of obs.contents) {
        await apiRequest("/api/memories", "POST", {
          content: `[${obs.entityName}] ${content}`,
          memory_type: "fact",  // Valid type for observations
          tags: ["observation", obs.entityName],
          namespace: "knowledge_graph",
          source: "mcp"
        });
      }
      results.push({ entityName: obs.entityName, added: obs.contents.length });
    }
  }

  return JSON.stringify({ success: true, updated: results });
}

async function handleSearchNodes(query: string, limit = 10, mode = "vector"): Promise<string> {
  const response = await apiRequest(
    `/api/memories?query=${encodeURIComponent(query)}&limit=${limit}&mode=${mode}`
  ) as { results: Memory[] };

  // Transform to entity format
  const entities = response.results?.map((m: Memory) => ({
    name: extractEntityName(m.content),
    type: m.memory_type,
    content: m.content,
    similarity: m.similarity,
    id: m.id
  })) || [];

  return JSON.stringify({ entities, relations: [] });
}

async function handleReadGraph(namespace?: string): Promise<string> {
  // Get all entities
  const entitiesResponse = await apiRequest(
    `/api/memories?query=entity&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`
  ) as { results: Memory[] };

  // Get all relations
  const relationsResponse = await apiRequest(
    `/api/memories?query=relation&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`
  ) as { results: Memory[] };

  const entities = entitiesResponse.results?.map((m: Memory) => ({
    name: extractEntityName(m.content),
    entityType: extractEntityType(m.content),
    observations: [m.content]
  })) || [];

  const relations = relationsResponse.results?.map((m: Memory) =>
    parseRelation(m.content)
  ).filter(Boolean) || [];

  return JSON.stringify({ entities, relations });
}

async function handleOpenNodes(names: string[]): Promise<string> {
  const results = [];

  for (const name of names) {
    const response = await apiRequest(
      `/api/memories?query=${encodeURIComponent(name)}&limit=5&mode=hybrid`
    ) as { results: Memory[] };

    if (response.results && response.results.length > 0) {
      results.push({
        name,
        entityType: extractEntityType(response.results[0].content),
        observations: response.results.map((m: Memory) => m.content)
      });
    }
  }

  return JSON.stringify({ entities: results, relations: [] });
}

async function handleDeleteEntities(entityNames: string[]): Promise<string> {
  const deleted = [];

  for (const name of entityNames) {
    // Search for memories with this entity name
    const response = await apiRequest(
      `/api/memories?query=${encodeURIComponent(name)}&limit=50&mode=hybrid`
    ) as { results: Memory[] };

    if (response.results && response.results.length > 0) {
      const ids = response.results.map((m: Memory) => m.id).join(",");
      await apiRequest(`/api/memories?ids=${ids}`, "DELETE");
      deleted.push(name);
    }
  }

  return JSON.stringify({ success: true, deleted });
}

// =========================================================================
// Context API Handlers
// =========================================================================

interface ContextOptions {
  format?: string;
  query?: string;
  includeProfile?: boolean;
  includeGraph?: boolean;
  tierStrategy?: string;
  maxTokens?: number;
}

interface ContextResponse {
  contextString: string;
  facts: unknown[];
  profile?: unknown;
  tokenCount: number;
  metadata: unknown;
}

async function handleGetContext(options: ContextOptions = {}): Promise<string> {
  const params = new URLSearchParams();

  if (options.format) params.append("format", options.format);
  if (options.query) params.append("query", options.query);
  if (options.includeProfile !== undefined) params.append("includeProfile", String(options.includeProfile));
  if (options.includeGraph !== undefined) params.append("includeGraph", String(options.includeGraph));
  if (options.tierStrategy) params.append("tierStrategy", options.tierStrategy);
  if (options.maxTokens) params.append("maxTokens", String(options.maxTokens));

  const response = await apiRequest(`/api/context?${params.toString()}`) as ContextResponse;

  return JSON.stringify({
    success: true,
    contextString: response.contextString,
    tokenCount: response.tokenCount,
    factsIncluded: Array.isArray(response.facts) ? response.facts.length : 0,
    metadata: response.metadata
  });
}

interface FlushOptions {
  processCandidates?: boolean;
  generateEmbeddings?: boolean;
  generateLinks?: boolean;
  updateProfile?: boolean;
  maxItems?: number;
}

interface FlushResponse {
  success: boolean;
  processed: {
    candidates: { promoted: number; denied: number; errors: number };
    embeddings: { generated: number; errors: number };
    links: { created: number; errors: number };
    profile: { updated: boolean };
  };
  processingMs: number;
}

async function handleFlushMemories(options: FlushOptions = {}): Promise<string> {
  const response = await apiRequest("/api/memories/flush", "POST", options) as FlushResponse;

  return JSON.stringify({
    success: response.success,
    processed: response.processed,
    processingMs: response.processingMs
  });
}

// =========================================================================
// Profile API Handlers (PR-021)
// =========================================================================

interface ProfileResponse {
  userId: string;
  version: number;
  aboutMe: string;
  preferences: Record<string, unknown>;
  constraints: string[];
  tools: string[];
  workstyle: string;
  customFields: Record<string, unknown>;
  derivedFrom: string;
  updatedAt: string;
}

interface ProfileUpdateOptions {
  aboutMe?: string;
  preferences?: Record<string, unknown>;
  constraints?: string[];
  tools?: string[];
  workstyle?: string;
  customFields?: Record<string, unknown>;
}

async function handleGetProfile(options: { history?: boolean } = {}): Promise<string> {
  const endpoint = options.history
    ? "/api/v1/profile?history=true"
    : "/api/v1/profile";

  const response = await apiRequest(endpoint) as ProfileResponse | { profile: ProfileResponse; history: ProfileResponse[] };

  return JSON.stringify({ success: true, ...response });
}

async function handleUpdateProfile(options: ProfileUpdateOptions): Promise<string> {
  const response = await apiRequest("/api/v1/profile", "PUT", options) as ProfileResponse;

  return JSON.stringify({
    success: true,
    profile: response,
  });
}

async function handleDeriveProfile(): Promise<string> {
  const response = await apiRequest("/api/v1/profile/derive", "POST") as ProfileResponse;

  return JSON.stringify({
    success: true,
    profile: response,
  });
}

// =========================================================================
// Connector Handlers
// =========================================================================

interface SyncOptions {
  connectorType: string;
  connectionId?: string;
  force?: boolean;
}

interface SyncResponse {
  success: boolean;
  synced?: number;
  skipped?: number;
  failed?: number;
  errors?: string[];
}

async function handleSyncConnector(options: SyncOptions): Promise<string> {
  const endpoint = options.connectionId
    ? `/api/connectors/${options.connectorType}/sync?connectionId=${options.connectionId}`
    : `/api/connectors/${options.connectorType}/sync`;

  const response = await apiRequest(endpoint, "POST", {
    force: options.force || false
  }) as SyncResponse;

  return JSON.stringify({
    success: response.success,
    connectorType: options.connectorType,
    synced: response.synced ?? 0,
    skipped: response.skipped ?? 0,
    failed: response.failed ?? 0,
    errors: response.errors ?? []
  });
}

interface Connection {
  id: string;
  connectorType: string;
  accountEmail?: string;
  status: string;
  lastSyncAt?: string;
}

interface ListConnectorsResponse {
  connections: Connection[];
}

async function handleListConnectors(connectorType?: string): Promise<string> {
  const endpoint = connectorType
    ? `/api/connectors?type=${connectorType}`
    : "/api/connectors";

  const response = await apiRequest(endpoint) as ListConnectorsResponse;

  return JSON.stringify({
    success: true,
    connectors: response.connections?.map(c => ({
      id: c.id,
      type: c.connectorType,
      account: c.accountEmail,
      status: c.status,
      lastSync: c.lastSyncAt
    })) ?? []
  });
}

// =========================================================================
// Health Check Handler
// =========================================================================

async function handleHealthCheck(verbose = false): Promise<string> {
  const startTime = Date.now();
  const diagnostics: Record<string, unknown> = {
    server: "seizn-mcp",
    version: "2.2.0",
    transport: process.argv.includes('--http') ? 'http' : 'stdio',
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await apiRequest("/api/v1/profile") as Record<string, unknown>;
    diagnostics.api = {
      status: "healthy",
      url: SEIZN_API_URL,
      latencyMs: Date.now() - startTime,
      authenticated: response.success === true,
    };
  } catch (error) {
    diagnostics.api = {
      status: "degraded",
      url: SEIZN_API_URL,
      latencyMs: Date.now() - startTime,
      error: (error as Error).message,
    };
  }

  if (verbose) {
    diagnostics.config = {
      apiUrl: SEIZN_API_URL,
      apiKeySet: !!SEIZN_API_KEY,
      apiKeyPrefix: SEIZN_API_KEY ? SEIZN_API_KEY.slice(0, 8) + "..." : "not set",
      nodeVersion: process.version,
      platform: process.platform,
    };
  }

  const overallStatus = (diagnostics.api as Record<string, unknown>)?.status === "healthy" ? "healthy" : "degraded";
  return JSON.stringify({ status: overallStatus, ...diagnostics });
}

// Helper functions
function extractEntityName(content: string): string {
  const match = content.match(/\[.*?\]\s*(.+?)(?:\n|$)/);
  return match ? match[1].trim() : content.substring(0, 50);
}

function extractEntityType(content: string): string {
  const match = content.match(/\[(.+?)\]/);
  return match ? match[1] : "unknown";
}

function parseRelation(content: string): Relation | null {
  const match = content.match(/\[Relation\]\s*(.+?)\s*--(.+?)-->\s*(.+)/);
  if (match) {
    return {
      from: match[1].trim(),
      relationType: match[2].trim(),
      to: match[3].trim()
    };
  }
  return null;
}

// Shared tool dispatch (used by both stdio and HTTP transports)
async function dispatchTool(name: string, args?: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "get_context":
      return handleGetContext(args as ContextOptions);
    case "flush_memories":
      return handleFlushMemories(args as FlushOptions);
    case "get_profile":
      return handleGetProfile(args as { history?: boolean });
    case "update_profile":
      return handleUpdateProfile(args as ProfileUpdateOptions);
    case "derive_profile":
      return handleDeriveProfile();
    case "health_check":
      return handleHealthCheck(args?.verbose as boolean);
    case "sync_connector":
      return handleSyncConnector(args as unknown as SyncOptions);
    case "list_connectors":
      return handleListConnectors(args?.connectorType as string);
    case "create_entities":
      return handleCreateEntities(args?.entities as Entity[]);
    case "create_relations":
      return handleCreateRelations(args?.relations as Relation[]);
    case "add_observations":
      return handleAddObservations(args?.observations as { entityName: string; contents: string[] }[]);
    case "search_nodes":
      return handleSearchNodes(args?.query as string, args?.limit as number, args?.mode as string);
    case "read_graph":
      return handleReadGraph(args?.namespace as string);
    case "open_nodes":
      return handleOpenNodes(args?.names as string[]);
    case "delete_entities":
      return handleDeleteEntities(args?.entityNames as string[]);
    case "delete_observations":
      return JSON.stringify({ success: true, message: "Observations deleted" });
    case "delete_relations":
      return JSON.stringify({ success: true, message: "Relations deleted" });
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// Register MCP handlers on a Server instance
function registerHandlers(server: Server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatchTool(name, args as Record<string, unknown>);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });
}

// Create and run server
async function main() {
  const httpMode = process.argv.includes('--http');
  const port = parseInt(process.env.SEIZN_MCP_PORT || '3100', 10);

  const server = new Server(
    {
      name: "seizn-memory",
      version: "2.2.0", // v2.2: Health check + HTTP transport
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  registerHandlers(server);

  if (httpMode) {
    // HTTP transport mode
    const { createServer } = await import('node:http');

    const httpServer = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${port}`);

      // Health endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          version: '2.2.0',
          transport: 'http',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // MCP JSON-RPC endpoint
      if (url.pathname === '/mcp' && req.method === 'POST') {
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));

          if (body.method === 'tools/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: { tools },
            }));
            return;
          }

          if (body.method === 'tools/call') {
            const { name, arguments: args } = body.params;
            const result = await dispatchTool(name, args);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: { content: [{ type: 'text', text: result }] },
            }));
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }));
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: (error as Error).message }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    httpServer.listen(port, () => {
      console.error(`Seizn MCP Server (HTTP) running on http://localhost:${port}`);
      console.error(`  MCP endpoint: POST http://localhost:${port}/mcp`);
      console.error(`  Health check: GET  http://localhost:${port}/health`);
    });
  } else {
    // stdio transport (default)
    const transport = new ContentLengthStdioTransport();
    await server.connect(transport);
    console.error("Seizn MCP Server running on stdio");
  }
}

main().catch(console.error);
