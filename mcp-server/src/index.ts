#!/usr/bin/env node

// Force UTF-8 encoding for Windows compatibility
if (process.platform === 'win32') {
  const { execSync } = require('child_process');
  try {
    execSync('chcp 65001', { stdio: 'ignore' });
  } catch {}
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { randomBytes, timingSafeEqual } from "crypto";

// Configuration from environment
const SEIZN_API_URL = process.env.SEIZN_API_URL || "https://www.seizn.com";
let SEIZN_API_KEY = process.env.SEIZN_API_KEY || "";

// ─── Credential Helpers (OAuth Device Flow) ──────────────────────────────────

function getCredentialsPath(): string {
  return path.join(os.homedir(), ".seizn", "credentials.json");
}

function loadCredentials(): string | null {
  try {
    const credPath = getCredentialsPath();
    if (fs.existsSync(credPath)) {
      const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
      if (creds.access_token && (!creds.expires_at || creds.expires_at > Date.now())) {
        return creds.access_token;
      }
    }
  } catch {}
  return null;
}

function saveCredentials(token: string, expiresIn: number): void {
  const credDir = path.join(os.homedir(), ".seizn");
  fs.mkdirSync(credDir, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(credDir, 0o700);
  } catch {}

  const credPath = path.join(credDir, "credentials.json");
  fs.writeFileSync(
    credPath,
    JSON.stringify({
      access_token: token,
      expires_at: Date.now() + expiresIn * 1000,
      created_at: new Date().toISOString(),
    }, null, 2),
    { encoding: "utf-8", mode: 0o600 }
  );
  try {
    fs.chmodSync(credPath, 0o600);
  } catch {}
}

// Try loading from credentials file if env not set
if (!SEIZN_API_KEY) {
  SEIZN_API_KEY = loadCredentials() || "";
}

if (!SEIZN_API_KEY) {
  console.error("Warning: SEIZN_API_KEY not set and no saved credentials found. Run auth_login tool to authenticate.");
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

const RESOURCE_DEFINITIONS = [
  {
    uri: "seizn://memories/recent",
    name: "Recent Memories",
    description: "Last 10 memories",
    mimeType: "application/json",
  },
  {
    uri: "seizn://profile",
    name: "User Profile",
    description: "Structured user profile",
    mimeType: "application/json",
  },
  {
    uri: "seizn://graph/summary",
    name: "Knowledge Graph Summary",
    description: "Entity and relation counts",
    mimeType: "application/json",
  },
] as const;

const RESOURCE_TEMPLATE_DEFINITIONS = [
  {
    uriTemplate: "seizn://memories/project/{name}",
    name: "Project Memories",
    description: "Memories filtered by project namespace",
  },
  {
    uriTemplate: "seizn://context/{format}",
    name: "Formatted Context",
    description: "Pre-formatted LLM context (brief/detailed/extended)",
  },
  {
    uriTemplate: "seizn://docs/setup/{editor}",
    name: "Editor Setup Guide",
    description: "Setup guide for AI editors (claude-code, cursor, windsurf, copilot, cline, aider, codex)",
  },
] as const;

function paginateByCursor<T>(items: readonly T[], cursor?: string | null, pageSize = items.length) {
  if (!cursor) {
    return { items: [...items] };
  }

  const offset = Number.parseInt(cursor, 10);
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;
  const slice = items.slice(safeOffset, safeOffset + pageSize);
  const nextOffset = safeOffset + slice.length;

  return {
    items: slice,
    nextCursor: nextOffset < items.length ? String(nextOffset) : undefined,
  };
}

// Content-Length framed transport (Claude/Codex clients expect this framing)
class ContentLengthStdioTransport {
  private buffer = Buffer.alloc(0);
  private framingMode: "content-length" | "newline" = "content-length";
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
      const crlfHeaderEnd = this.buffer.indexOf("\r\n\r\n");
      const lfHeaderEnd = this.buffer.indexOf("\n\n");
      const headerEnd =
        crlfHeaderEnd === -1
          ? lfHeaderEnd
          : lfHeaderEnd === -1
            ? crlfHeaderEnd
            : Math.min(crlfHeaderEnd, lfHeaderEnd);
      const headerSeparatorLength =
        headerEnd === crlfHeaderEnd ? 4 : headerEnd === lfHeaderEnd ? 2 : 0;

      // Fallback: accept bare newline-delimited JSON if no headers are present
      if (headerEnd === -1) {
        const newlineIndex = this.buffer.indexOf("\n");
        if (newlineIndex === -1) return;
        const line = this.buffer.slice(0, newlineIndex).toString("utf8").replace(/\r$/, "");
        this.buffer = this.buffer.slice(newlineIndex + 1);
        this.framingMode = "newline";
        this.safeHandle(line);
        continue;
      }

      const headerText = this.buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + headerSeparatorLength);
        continue;
      }

      const contentLength = Number(lengthMatch[1]);
      const messageStart = headerEnd + headerSeparatorLength;
      const messageEnd = messageStart + contentLength;
      if (this.buffer.length < messageEnd) return;

      const jsonText = this.buffer.slice(messageStart, messageEnd).toString("utf8");
      this.buffer = this.buffer.slice(messageEnd);
      this.framingMode = "content-length";
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
    const payload =
      this.framingMode === "newline"
        ? `${json}\n`
        : `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
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

  // Prevent indefinite hangs if the Seizn API becomes slow/unreachable.
  const timeoutMsRaw = process.env.SEIZN_API_TIMEOUT_MS;
  const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : 15000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 15000);

  let response: Response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && typeof err === "object" && "name" in err && (err as { name?: string }).name === "AbortError") {
      throw new Error(`API request timed out after ${timeoutMs}ms: ${method} ${endpoint}`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

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
  {
    name: "session_init",
    description: "Initialize a new session by loading recent context: user profile, recent memories, and session summary. Auto-detects project from cwd for project-specific context.",
    inputSchema: {
      type: "object",
      properties: {
        hoursBack: {
          type: "number",
          description: "Hours of recent memories to load (default: 24)"
        },
        limit: {
          type: "number",
          description: "Max memories to return (default: 20)"
        },
        namespace: {
          type: "string",
          description: "Namespace filter (default: all)"
        },
        cwd: {
          type: "string",
          description: "Current working directory path. Used to auto-detect project name from folder or package.json."
        },
        autoDetectProject: {
          type: "boolean",
          description: "Auto-detect project from cwd (default: true)"
        }
      }
    }
  },
  // =========================================================================
  // Webhook Tools
  // =========================================================================
  {
    name: "create_webhook",
    description: "Create a webhook to receive notifications when memories change. Requires HTTPS URL.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Descriptive name for the webhook" },
        url: { type: "string", description: "HTTPS URL to receive webhook POST requests" },
        events: {
          type: "array",
          items: { type: "string", enum: ["memory.created", "memory.updated", "memory.deleted"] },
          description: "Events to subscribe to (default: ['memory.created'])"
        },
        namespace: { type: "string", description: "Optional namespace filter" }
      },
      required: ["name", "url"]
    }
  },
  {
    name: "list_webhooks",
    description: "List all configured webhooks and their status",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "delete_webhook",
    description: "Delete a webhook by ID",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Webhook ID to delete" }
      },
      required: ["id"]
    }
  },
  {
    name: "webhook_deliveries",
    description: "Get delivery history for webhooks. Shows status, attempts, and errors.",
    inputSchema: {
      type: "object",
      properties: {
        webhook_id: { type: "string", description: "Optional webhook ID to filter by" },
        status: { type: "string", enum: ["pending", "success", "failed"], description: "Optional status filter" },
        limit: { type: "number", description: "Max results (default: 20)" }
      }
    }
  },
  // =========================================================================
  // Config Sync Tools
  // =========================================================================
  {
    name: "list_config_formats",
    description: "List supported AI tool config file formats that Seizn can generate (CLAUDE.md, AGENTS.md, .cursorrules, etc.)",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "sync_config_files",
    description: "Generate AI tool config files from Seizn memories. Supports push (Seizn -> local files) and pull (local files -> Seizn) directions.",
    inputSchema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["push", "pull"],
          description: "push: write Seizn memories to local config files. pull: read local config files into Seizn."
        },
        formats: {
          type: "array",
          items: { type: "string" },
          description: "Config format IDs to sync (e.g., ['claude', 'cursor']). Empty = all."
        },
        cwd: {
          type: "string",
          description: "Working directory where config files will be written/read"
        },
        project: {
          type: "string",
          description: "Optional project name to filter memories"
        },
        dryRun: {
          type: "boolean",
          description: "Preview generated content without writing files (default: false)"
        }
      },
      required: ["direction", "cwd"]
    }
  },
  // =========================================================================
  // MCP Sampling Tool
  // =========================================================================
  {
    name: "sampling_draft",
    description: "Draft text through MCP sampling/createMessage while signaling sampling.tools capability.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Prompt to send to the connected MCP client model"
        },
        maxTokens: {
          type: "number",
          description: "Max response tokens (64-4096, default: 400)"
        },
        includeSearchTool: {
          type: "boolean",
          description: "Include a Seizn search_nodes tool definition in sampling request (default: true)"
        },
        toolMode: {
          type: "string",
          enum: ["auto", "none", "required"],
          description: "Tool choice mode when includeSearchTool=true (default: none)"
        }
      },
      required: ["prompt"]
    }
  },
  // =========================================================================
  // Auth Tool
  // =========================================================================
  {
    name: "auth_login",
    description: "Start OAuth device flow to authenticate with Seizn. Opens a browser for approval. Use this if no API key is configured.",
    inputSchema: {
      type: "object",
      properties: {
        force: { type: "boolean", description: "Force re-authentication even if already authenticated" }
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

    const response = await apiRequest("/api/v1/memories", "POST", {
      content,
      memory_type: "fact",  // Valid type: fact, preference, experience, relationship, instruction
      tags: ["entity", entity.entityType, entity.name],
      namespace: "knowledge_graph",
      source: "mcp"
    }) as { success: boolean; data: { memory: Memory } };

    results.push({
      name: entity.name,
      type: entity.entityType,
      id: response.data?.memory?.id
    });
  }

  return JSON.stringify({ success: true, created: results });
}

async function handleCreateRelations(relations: Relation[]): Promise<string> {
  // Store relations as memories with special format
  const results = [];

  for (const rel of relations) {
    const content = `[Relation] ${rel.from} --${rel.relationType}--> ${rel.to}`;

    const response = await apiRequest("/api/v1/memories", "POST", {
      content,
      memory_type: "relationship",  // Valid type for relations
      tags: ["relation", rel.from, rel.to, rel.relationType],
      namespace: "knowledge_graph",
      source: "mcp"
    }) as { success: boolean; data: { memory: Memory } };

    results.push({
      from: rel.from,
      to: rel.to,
      type: rel.relationType,
      id: response.data?.memory?.id
    });
  }

  return JSON.stringify({ success: true, created: results });
}

async function handleAddObservations(observations: { entityName: string; contents: string[] }[]): Promise<string> {
  const results = [];

  for (const obs of observations) {
    // First search for the entity
    const searchResponse = await apiRequest(
      `/api/v1/memories?query=${encodeURIComponent(obs.entityName)}&limit=1&mode=keyword`
    ) as { success: boolean; data: { results: Memory[] } };

    if (searchResponse.data?.results && searchResponse.data.results.length > 0) {
      // Add new observations as new memories linked to the entity
      for (const content of obs.contents) {
        await apiRequest("/api/v1/memories", "POST", {
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
    `/api/v1/memories?query=${encodeURIComponent(query)}&limit=${limit}&mode=${mode}`
  ) as { success: boolean; data: { results: Memory[] } };

  // Transform to entity format
  const entities = response.data?.results?.map((m: Memory) => ({
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
    `/api/v1/memories?query=entity&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`
  ) as { success: boolean; data: { results: Memory[] } };

  // Get all relations
  const relationsResponse = await apiRequest(
    `/api/v1/memories?query=relation&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`
  ) as { success: boolean; data: { results: Memory[] } };

  const entities = entitiesResponse.data?.results?.map((m: Memory) => ({
    name: extractEntityName(m.content),
    entityType: extractEntityType(m.content),
    observations: [m.content]
  })) || [];

  const relations = relationsResponse.data?.results?.map((m: Memory) =>
    parseRelation(m.content)
  ).filter(Boolean) || [];

  return JSON.stringify({ entities, relations });
}

async function handleOpenNodes(names: string[]): Promise<string> {
  const results = [];

  for (const name of names) {
    const response = await apiRequest(
      `/api/v1/memories?query=${encodeURIComponent(name)}&limit=5&mode=keyword`
    ) as { success: boolean; data: { results: Memory[] } };

    if (response.data?.results && response.data.results.length > 0) {
      results.push({
        name,
        entityType: extractEntityType(response.data.results[0].content),
        observations: response.data.results.map((m: Memory) => m.content)
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
      `/api/v1/memories?query=${encodeURIComponent(name)}&limit=50&mode=keyword`
    ) as { success: boolean; data: { results: Memory[] } };

    if (response.data?.results && response.data.results.length > 0) {
      const ids = response.data.results.map((m: Memory) => m.id).join(",");
      await apiRequest(`/api/v1/memories?ids=${ids}`, "DELETE");
      deleted.push(name);
    }
  }

  return JSON.stringify({ success: true, deleted });
}

async function handleDeleteObservations(deletions: { entityName: string; observations: string[] }[]): Promise<string> {
  const results = [];

  for (const del of deletions) {
    let deletedCount = 0;

    for (const observation of del.observations) {
      // Search for memories matching this observation content
      const searchResponse = await apiRequest(
        `/api/v1/memories?query=${encodeURIComponent(`[${del.entityName}] ${observation}`)}&limit=5&mode=keyword`
      ) as { success: boolean; data: { results: Memory[] } };

      const matches = searchResponse.data?.results?.filter(
        (m: Memory) => m.content.includes(observation) && m.tags?.includes('observation')
      ) || [];

      if (matches.length > 0) {
        const ids = matches.map((m: Memory) => m.id).join(",");
        await apiRequest(`/api/v1/memories?ids=${ids}`, "DELETE");
        deletedCount += matches.length;
      }
    }

    results.push({ entityName: del.entityName, deleted: deletedCount });
  }

  return JSON.stringify({ success: true, results });
}

async function handleDeleteRelations(relations: { from: string; to: string; relationType: string }[]): Promise<string> {
  const deleted = [];

  for (const rel of relations) {
    // Relations are stored as memories with tags
    const query = `${rel.from} ${rel.relationType} ${rel.to}`;
    const searchResponse = await apiRequest(
      `/api/v1/memories?query=${encodeURIComponent(query)}&limit=10&mode=keyword`
    ) as { success: boolean; data: { results: Memory[] } };

    const matches = searchResponse.data?.results?.filter(
      (m: Memory) =>
        m.content.includes(rel.from) &&
        m.content.includes(rel.to) &&
        m.tags?.includes('relation')
    ) || [];

    if (matches.length > 0) {
      const ids = matches.map((m: Memory) => m.id).join(",");
      await apiRequest(`/api/v1/memories?ids=${ids}`, "DELETE");
      deleted.push({ from: rel.from, to: rel.to, relationType: rel.relationType });
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
    version: "3.0.0",
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

// =========================================================================
// Session Init Handler
// =========================================================================

interface SessionInitOptions {
  hoursBack?: number;
  limit?: number;
  namespace?: string;
  cwd?: string;
  autoDetectProject?: boolean;
}

// ─── Project Detection ───────────────────────────────────────────────────────

function detectProject(cwd: string): string | null {
  // Try package.json
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name;
    }
  } catch {}

  // Try pyproject.toml
  try {
    const pyprojectPath = path.join(cwd, "pyproject.toml");
    if (fs.existsSync(pyprojectPath)) {
      const content = fs.readFileSync(pyprojectPath, "utf-8");
      const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) return nameMatch[1];
    }
  } catch {}

  // Try Cargo.toml
  try {
    const cargoPath = path.join(cwd, "Cargo.toml");
    if (fs.existsSync(cargoPath)) {
      const content = fs.readFileSync(cargoPath, "utf-8");
      const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
      if (nameMatch) return nameMatch[1];
    }
  } catch {}

  // Fallback: directory name
  return path.basename(cwd);
}

async function handleSessionInit(options: SessionInitOptions = {}): Promise<string> {
  const hoursBack = options.hoursBack || 24;
  const limit = options.limit || 20;

  const sections: string[] = [];

  // 0. Auto-detect project from cwd
  let detectedProject: string | null = null;
  if (options.cwd && options.autoDetectProject !== false) {
    detectedProject = detectProject(options.cwd);
    if (detectedProject) {
      sections.push(`## Detected Project: ${detectedProject}\nWorking directory: ${options.cwd}`);
    }
  }

  const effectiveNamespace = options.namespace || detectedProject || undefined;

  // 1. Load user profile
  try {
    const profileResponse = await apiRequest("/api/v1/profile") as Record<string, unknown>;
    if (profileResponse.success && profileResponse.profile) {
      sections.push(`## User Profile\n${JSON.stringify(profileResponse.profile, null, 2)}`);
    }
  } catch {
    sections.push("## User Profile\n(Could not load profile)");
  }

  // 2. Load recent memories (with project namespace filter)
  try {
    const nsParam = effectiveNamespace ? `&namespace=${encodeURIComponent(effectiveNamespace)}` : "";
    const recentResponse = await apiRequest(
      `/api/v1/memories?query=recent&limit=${limit}&mode=keyword${nsParam}`
    ) as { success: boolean; data: { results: Array<{ id: string; content: string; memory_type: string; tags?: string[]; created_at?: string }> } };

    if (recentResponse.data?.results && recentResponse.data.results.length > 0) {
      const memorySummary = recentResponse.data.results.map(m =>
        `- [${m.memory_type}] ${m.content}${m.tags?.length ? ` (tags: ${m.tags.join(', ')})` : ''}`
      ).join('\n');
      sections.push(`## Recent Memories (last ${hoursBack}h)${effectiveNamespace ? ` [${effectiveNamespace}]` : ""}\n${memorySummary}`);
    } else {
      sections.push(`## Recent Memories\nNo recent memories found.`);
    }
  } catch {
    sections.push("## Recent Memories\n(Could not load memories)");
  }

  // 3. Load project-specific instructions (if project detected)
  if (detectedProject) {
    try {
      const instrResponse = await apiRequest(
        `/api/v1/memories?query=${encodeURIComponent(`instructions for ${detectedProject}`)}&limit=10&mode=hybrid`
      ) as { success: boolean; data: { results: Memory[] } };

      const instructions = instrResponse.data?.results?.filter(
        (m: Memory) => m.memory_type === "instruction" || m.memory_type === "preference"
      ) || [];

      if (instructions.length > 0) {
        const instrSummary = instructions.map(m => `- ${m.content}`).join('\n');
        sections.push(`## Project Instructions (${detectedProject})\n${instrSummary}`);
      }
    } catch {}
  }

  // 4. Get context summary
  try {
    const contextResponse = await apiRequest("/api/context?format=brief") as { contextString?: string; tokenCount?: number };
    if (contextResponse.contextString) {
      sections.push(`## Context Summary\n${contextResponse.contextString}`);
    }
  } catch {
    // Context API may not be available
  }

  return JSON.stringify({
    success: true,
    detectedProject,
    sessionContext: sections.join('\n\n'),
    memoriesLoaded: sections.length > 1,
    timestamp: new Date().toISOString(),
  });
}

// =========================================================================
// Webhook Handlers
// =========================================================================

async function handleCreateWebhook(args: { name: string; url: string; events?: string[]; namespace?: string }): Promise<string> {
  const response = await apiRequest("/api/webhooks", "POST", {
    name: args.name,
    url: args.url,
    events: args.events || ["memory.created"],
    namespace: args.namespace,
  });
  return JSON.stringify(response);
}

async function handleListWebhooks(): Promise<string> {
  const response = await apiRequest("/api/webhooks");
  return JSON.stringify(response);
}

async function handleDeleteWebhook(id: string): Promise<string> {
  const response = await apiRequest(`/api/webhooks?id=${encodeURIComponent(id)}`, "DELETE");
  return JSON.stringify(response);
}

async function handleWebhookDeliveries(args: { webhook_id?: string; status?: string; limit?: number }): Promise<string> {
  const params = new URLSearchParams();
  if (args.webhook_id) params.append("webhook_id", args.webhook_id);
  if (args.status) params.append("status", args.status);
  if (args.limit) params.append("limit", String(args.limit));
  const response = await apiRequest(`/api/webhooks/deliveries?${params.toString()}`);
  return JSON.stringify(response);
}

// =========================================================================
// Config Sync Handlers
// =========================================================================

const CONFIG_FORMATS = [
  { id: "claude", file: "CLAUDE.md", tool: "Claude Code", format: "markdown" },
  { id: "codex", file: "AGENTS.md", tool: "OpenAI Codex CLI", format: "markdown" },
  { id: "cursor", file: ".cursor/rules", tool: "Cursor", format: "mdc" },
  { id: "cursorrules", file: ".cursorrules", tool: "Cursor (legacy)", format: "plain" },
  { id: "windsurf", file: ".windsurfrules", tool: "Windsurf", format: "plain" },
  { id: "copilot", file: ".github/copilot-instructions.md", tool: "GitHub Copilot", format: "markdown" },
  { id: "cline", file: ".clinerules", tool: "Cline", format: "plain" },
  { id: "aider", file: "CONVENTIONS.md", tool: "Aider", format: "markdown" },
] as const;

function formatConfigContent(
  memories: { instructions: string[]; preferences: string[]; facts: string[] },
  formatId: string,
  project?: string,
): string {
  const { instructions, preferences, facts } = memories;
  const timestamp = new Date().toISOString();
  const projectHeader = project ? ` - ${project}` : "";

  switch (formatId) {
    case "claude":
    case "copilot":
      return [
        `# Project Instructions${projectHeader}`,
        "",
        preferences.length ? `## Preferences\n${preferences.map(p => `- ${p}`).join("\n")}` : "",
        instructions.length ? `## Instructions\n${instructions.map(i => `- ${i}`).join("\n")}` : "",
        facts.length ? `## Key Facts\n${facts.map(f => `- ${f}`).join("\n")}` : "",
        "",
        `---`,
        `*Auto-generated by Seizn Memory (seizn.com). Last synced: ${timestamp}*`,
      ].filter(Boolean).join("\n");

    case "codex":
      return [
        `# AGENTS.md${projectHeader}`,
        "",
        `> This file was auto-generated by Seizn Memory.`,
        "",
        preferences.length ? `## Preferences\n${preferences.map(p => `- ${p}`).join("\n")}` : "",
        instructions.length ? `## Instructions\n${instructions.map(i => `- ${i}`).join("\n")}` : "",
        facts.length ? `## Context\n${facts.map(f => `- ${f}`).join("\n")}` : "",
        "",
        `<!-- Seizn sync: ${timestamp} -->`,
      ].filter(Boolean).join("\n");

    case "cursor":
    case "cursorrules":
    case "windsurf":
    case "cline":
      return [
        `You are working on a project${projectHeader} with the following context:`,
        "",
        preferences.length ? `Preferences:\n${preferences.map(p => `- ${p}`).join("\n")}` : "",
        "",
        instructions.length ? `Follow these instructions:\n${instructions.map(i => `- ${i}`).join("\n")}` : "",
        "",
        facts.length ? `Key facts:\n${facts.map(f => `- ${f}`).join("\n")}` : "",
        "",
        `# Auto-generated by Seizn Memory (seizn.com). Last synced: ${timestamp}`,
      ].filter(Boolean).join("\n");

    case "aider":
      return [
        `# Conventions${projectHeader}`,
        "",
        preferences.length ? `## Preferences\n${preferences.map(p => `- ${p}`).join("\n")}` : "",
        instructions.length ? `## Instructions\n${instructions.map(i => `- ${i}`).join("\n")}` : "",
        facts.length ? `## Context\n${facts.map(f => `- ${f}`).join("\n")}` : "",
        "",
        `<!-- Seizn sync: ${timestamp} -->`,
      ].filter(Boolean).join("\n");

    default:
      return instructions.concat(preferences, facts).join("\n");
  }
}

async function fetchMemoriesForSync(project?: string): Promise<{ instructions: string[]; preferences: string[]; facts: string[] }> {
  const nsParam = project ? `&namespace=${encodeURIComponent(project)}` : "";

  const [instrRes, prefRes, factRes] = await Promise.all([
    apiRequest(`/api/v1/memories?query=instruction&limit=50&mode=keyword${nsParam}`) as Promise<{ data?: { results?: Memory[] } }>,
    apiRequest(`/api/v1/memories?query=preference&limit=50&mode=keyword${nsParam}`) as Promise<{ data?: { results?: Memory[] } }>,
    apiRequest(`/api/v1/memories?query=fact&limit=50&mode=keyword${nsParam}`) as Promise<{ data?: { results?: Memory[] } }>,
  ]);

  return {
    instructions: (instrRes.data?.results || []).filter(m => m.memory_type === "instruction").map(m => m.content),
    preferences: (prefRes.data?.results || []).filter(m => m.memory_type === "preference").map(m => m.content),
    facts: (factRes.data?.results || []).filter(m => m.memory_type === "fact").map(m => m.content).slice(0, 20),
  };
}

async function handleListConfigFormats(): Promise<string> {
  return JSON.stringify({ formats: CONFIG_FORMATS });
}

async function handleSyncConfigFiles(args: {
  direction: string;
  cwd: string;
  formats?: string[];
  project?: string;
  dryRun?: boolean;
}): Promise<string> {
  const targetFormats = args.formats?.length
    ? CONFIG_FORMATS.filter(f => args.formats!.includes(f.id))
    : [...CONFIG_FORMATS];

  if (targetFormats.length === 0) {
    return JSON.stringify({ success: false, error: "No matching formats found" });
  }

  if (args.direction === "push") {
    // Seizn → local files
    const memories = await fetchMemoriesForSync(args.project);
    const results: { file: string; path: string; content?: string; written: boolean }[] = [];

    for (const fmt of targetFormats) {
      const content = formatConfigContent(memories, fmt.id, args.project);
      const filePath = path.join(args.cwd, fmt.file);

      if (args.dryRun) {
        results.push({ file: fmt.file, path: filePath, content, written: false });
      } else {
        const dir = path.dirname(filePath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        results.push({ file: fmt.file, path: filePath, written: true });
      }
    }

    return JSON.stringify({ success: true, direction: "push", results });
  }

  if (args.direction === "pull") {
    // Local files → Seizn
    const results: { file: string; memoriesCreated: number }[] = [];

    for (const fmt of targetFormats) {
      const filePath = path.join(args.cwd, fmt.file);
      if (!fs.existsSync(filePath)) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      if (!content.trim()) continue;

      if (!args.dryRun) {
        await apiRequest("/api/v1/memories", "POST", {
          content: `[Config: ${fmt.tool}] ${content}`,
          memory_type: "instruction",
          tags: ["config_sync", fmt.id, fmt.tool],
          namespace: args.project || "global",
          source: "config_sync",
        });
      }
      results.push({ file: fmt.file, memoriesCreated: 1 });
    }

    return JSON.stringify({ success: true, direction: "pull", results });
  }

  return JSON.stringify({ success: false, error: "Invalid direction. Use 'push' or 'pull'." });
}

// =========================================================================
// Auth Login Handler (Device Authorization Grant)
// =========================================================================

async function handleAuthLogin(force = false): Promise<string> {
  if (!force) {
    const existing = loadCredentials();
    if (existing) {
      return JSON.stringify({ success: true, message: "Already authenticated. Use force=true to re-authenticate." });
    }
  }

  // Step 1: Request device code
  const deviceResponse = await fetch(`${SEIZN_API_URL}/api/auth/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!deviceResponse.ok) {
    const errorText = await deviceResponse.text();
    return JSON.stringify({ success: false, error: `Failed to start device flow: ${errorText}` });
  }

  const deviceData = await deviceResponse.json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
  };

  const message = `Please visit ${deviceData.verification_uri} and enter code: ${deviceData.user_code}`;

  // Step 2: Poll for token
  const pollInterval = (deviceData.interval || 5) * 1000;
  const maxPolls = Math.ceil(deviceData.expires_in / (deviceData.interval || 5));

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval));

    try {
      const tokenResponse = await fetch(`${SEIZN_API_URL}/api/auth/device/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_code: deviceData.device_code }),
      });

      const tokenData = await tokenResponse.json() as {
        access_token?: string;
        expires_in?: number;
        error?: string;
      };

      if (tokenData.access_token) {
        saveCredentials(tokenData.access_token, tokenData.expires_in || 31536000);
        SEIZN_API_KEY = tokenData.access_token;
        return JSON.stringify({
          success: true,
          message: "Authentication successful! Credentials saved to ~/.seizn/credentials.json",
        });
      }

      if (tokenData.error === "expired_token") {
        return JSON.stringify({ success: false, error: "Authentication timed out. Please try again." });
      }
    } catch {}
  }

  return JSON.stringify({ success: false, error: "Authentication timed out.", instructions: message });
}

interface SamplingDraftArgs {
  prompt?: string;
  maxTokens?: number;
  includeSearchTool?: boolean;
  toolMode?: "auto" | "none" | "required";
}

function renderSamplingBlock(contentBlock: unknown): string {
  if (!contentBlock || typeof contentBlock !== "object") return "";

  const block = contentBlock as Record<string, unknown>;
  const type = typeof block.type === "string" ? block.type : "unknown";

  if (type === "text" && typeof block.text === "string") {
    return block.text;
  }

  if (type === "tool_use") {
    const name = typeof block.name === "string" ? block.name : "unknown";
    const input = block.input && typeof block.input === "object"
      ? JSON.stringify(block.input)
      : "{}";
    return `[tool_use:${name}] ${input}`;
  }

  if (type === "tool_result") {
    const toolUseId = typeof block.toolUseId === "string" ? block.toolUseId : "unknown";
    return `[tool_result:${toolUseId}]`;
  }

  return `[${type}]`;
}

function renderSamplingContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content.map(renderSamplingBlock).filter(Boolean).join("\n");
  }
  return renderSamplingBlock(content);
}

async function handleSamplingDraft(server: Server, args: SamplingDraftArgs = {}): Promise<string> {
  const prompt = (args.prompt || "").trim();
  if (!prompt) {
    return JSON.stringify({ success: false, error: "prompt is required" });
  }

  const clientCapabilities = server.getClientCapabilities();
  if (!clientCapabilities?.sampling) {
    return JSON.stringify({
      success: false,
      error: "Connected client does not advertise sampling capability",
      hint: "Use an MCP client that supports sampling/createMessage over stdio transport.",
    });
  }

  const maxTokensRaw = typeof args.maxTokens === "number" ? args.maxTokens : 400;
  const maxTokens = Math.max(64, Math.min(4096, Math.floor(maxTokensRaw)));
  const includeSearchTool = args.includeSearchTool !== false;
  const toolMode = args.toolMode || "none";

  const samplingParams = {
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: prompt },
      },
    ],
    maxTokens,
  };

  const searchTool: Tool = {
    name: "search_nodes",
    description: "Search Seizn memory graph by semantic query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query string" },
        limit: { type: "number", description: "Maximum results (default 10)" },
      },
      required: ["query"],
    },
  };

  try {
    const response = includeSearchTool
      ? await server.createMessage({
          ...samplingParams,
          tools: [searchTool],
          toolChoice: { mode: toolMode },
        })
      : await server.createMessage(samplingParams);

    return JSON.stringify({
      success: true,
      usedSamplingTools: includeSearchTool,
      toolMode: includeSearchTool ? toolMode : "none",
      clientSupportsSamplingTools: Boolean(clientCapabilities.sampling.tools),
      model: response.model,
      stopReason: response.stopReason,
      content: renderSamplingContent(response.content),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Graceful fallback for clients that support sampling but not sampling.tools
    if (includeSearchTool && message.toLowerCase().includes("sampling tools capability")) {
      try {
        const fallbackResponse = await server.createMessage(samplingParams);
        return JSON.stringify({
          success: true,
          usedSamplingTools: false,
          fallbackWithoutTools: true,
          error: message,
          model: fallbackResponse.model,
          stopReason: fallbackResponse.stopReason,
          content: renderSamplingContent(fallbackResponse.content),
        });
      } catch (fallbackError) {
        const fallbackMessage =
          fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        return JSON.stringify({
          success: false,
          usedSamplingTools: true,
          fallbackWithoutTools: true,
          error: message,
          fallbackError: fallbackMessage,
        });
      }
    }

    return JSON.stringify({ success: false, error: message });
  }
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

// =========================================================================
// Editor Setup Documentation
// =========================================================================

const EDITOR_DOCS: Record<string, string> = {
  "claude-code": `# Seizn + Claude Code Setup

## Configuration
Add to your Claude Code MCP settings (\`~/.claude/settings.json\`):

\`\`\`json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "seizn-mcp@latest"],
      "env": {
        "SEIZN_API_KEY": "your-api-key"
      }
    }
  }
}
\`\`\`

## Windows (UTF-8 fix)
\`\`\`json
{
  "command": "cmd",
  "args": ["/c", "chcp 65001 >nul && npx -y seizn-mcp@latest"]
}
\`\`\`

## Config Sync
Use \`sync_config_files\` tool to generate \`CLAUDE.md\` from your Seizn memories:
- Push: Seizn memories → CLAUDE.md
- Pull: CLAUDE.md → Seizn memories

## Key Tools
- \`session_init\`: Call at session start to load context
- \`search_nodes\`: Search your memory graph
- \`get_context\`: Get formatted context for prompts
`,

  "claude-desktop": `# Seizn + Claude Desktop Setup

## Configuration
Add to Claude Desktop settings (\`claude_desktop_config.json\`):

\`\`\`json
{
  "mcpServers": {
    "seizn": {
      "command": "npx",
      "args": ["-y", "seizn-mcp@latest"],
      "env": {
        "SEIZN_API_URL": "https://www.seizn.com",
        "SEIZN_API_KEY": "your-api-key"
      }
    }
  }
}
\`\`\`

## Getting Started
1. Get your API key from https://www.seizn.com/settings/api-keys
2. Add the config above
3. Restart Claude Desktop
4. Ask Claude to run \`session_init\` to load your memory context
`,

  "cursor": `# Seizn + Cursor Setup

## Option 1: MCP Integration (Recommended)
In Cursor Settings > MCP Servers, add:
\`\`\`json
{
  "seizn": {
    "command": "npx",
    "args": ["-y", "seizn-mcp@latest"],
    "env": {
      "SEIZN_API_KEY": "your-api-key"
    }
  }
}
\`\`\`

## Option 2: Config File Sync
Use the \`sync_config_files\` tool to generate \`.cursor/rules\` or \`.cursorrules\`:
\`\`\`
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["cursor"] })
\`\`\`

## Both Options
- MCP gives Cursor real-time access to your memories
- Config sync is a static snapshot — good for team sharing
`,

  "windsurf": `# Seizn + Windsurf Setup

## MCP Integration
In Windsurf Settings > MCP, add seizn-mcp:
\`\`\`json
{
  "seizn": {
    "command": "npx",
    "args": ["-y", "seizn-mcp@latest"],
    "env": {
      "SEIZN_API_KEY": "your-api-key"
    }
  }
}
\`\`\`

## Config File Sync
Generate \`.windsurfrules\` from Seizn memories:
\`\`\`
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["windsurf"] })
\`\`\`
`,

  "copilot": `# Seizn + GitHub Copilot Setup

## Config File Sync
Generate \`.github/copilot-instructions.md\` from Seizn memories:
\`\`\`
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["copilot"] })
\`\`\`

This file is automatically read by GitHub Copilot to customize its behavior.

## Note
GitHub Copilot does not support MCP servers directly.
Use config file sync to bridge your Seizn memories into Copilot's instruction format.
`,

  "cline": `# Seizn + Cline Setup

## MCP Integration
In Cline settings, add MCP server:
\`\`\`json
{
  "seizn": {
    "command": "npx",
    "args": ["-y", "seizn-mcp@latest"],
    "env": {
      "SEIZN_API_KEY": "your-api-key"
    }
  }
}
\`\`\`

## Config File Sync
Generate \`.clinerules\` from Seizn memories:
\`\`\`
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["cline"] })
\`\`\`
`,

  "aider": `# Seizn + Aider Setup

## Config File Sync
Generate \`CONVENTIONS.md\` from Seizn memories:
\`\`\`
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["aider"] })
\`\`\`

Aider reads CONVENTIONS.md automatically to understand your project's coding standards.

## Note
Aider does not support MCP servers. Use config file sync to bridge your Seizn memories.
`,

  "codex": `# Seizn + OpenAI Codex CLI Setup

## Config File Sync
Generate \`AGENTS.md\` from Seizn memories:
\`\`\`
sync_config_files({ direction: "push", cwd: "/your/project", formats: ["codex"] })
\`\`\`

OpenAI Codex CLI reads AGENTS.md as the primary instruction file.

## Workflow
1. Store instructions in Seizn via any AI tool
2. Run \`sync_config_files\` to push to AGENTS.md
3. Codex CLI picks up the instructions automatically
`,
};

// Shared tool dispatch (used by both stdio and HTTP transports)
async function dispatchTool(name: string, args?: Record<string, unknown>, server?: Server): Promise<string> {
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
    case "session_init":
      return handleSessionInit(args as SessionInitOptions);
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
      return handleDeleteObservations(args?.deletions as { entityName: string; observations: string[] }[]);
    case "delete_relations":
      return handleDeleteRelations(args?.relations as { from: string; to: string; relationType: string }[]);
    // Webhook tools
    case "create_webhook":
      return handleCreateWebhook(args as { name: string; url: string; events?: string[]; namespace?: string });
    case "list_webhooks":
      return handleListWebhooks();
    case "delete_webhook":
      return handleDeleteWebhook(args?.id as string);
    case "webhook_deliveries":
      return handleWebhookDeliveries(args as { webhook_id?: string; status?: string; limit?: number });
    // Config sync tools
    case "list_config_formats":
      return handleListConfigFormats();
    case "sync_config_files":
      return handleSyncConfigFiles(args as { direction: string; cwd: string; formats?: string[]; project?: string; dryRun?: boolean });
    case "sampling_draft":
      if (!server) {
        throw new Error("sampling_draft requires a connected MCP server session");
      }
      return handleSamplingDraft(server, args as SamplingDraftArgs);
    // Auth tool
    case "auth_login":
      return handleAuthLogin(args?.force as boolean);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── Resource dispatch (used by both stdio and HTTP) ─────────────────────────

async function dispatchResource(uri: string): Promise<{ mimeType: string; text: string }> {
  if (uri === "seizn://memories/recent") {
    const data = await apiRequest("/api/v1/memories?query=recent&limit=10&mode=keyword");
    return { mimeType: "application/json", text: JSON.stringify(data, null, 2) };
  }

  if (uri === "seizn://profile") {
    const data = await apiRequest("/api/v1/profile");
    return { mimeType: "application/json", text: JSON.stringify(data, null, 2) };
  }

  if (uri === "seizn://graph/summary") {
    const entities = await apiRequest("/api/v1/memories?query=entity&limit=100&mode=keyword") as { data?: { results?: Memory[] } };
    const relations = await apiRequest("/api/v1/memories?query=relation&limit=100&mode=keyword") as { data?: { results?: Memory[] } };
    return {
      mimeType: "application/json",
      text: JSON.stringify({
        entityCount: entities.data?.results?.length ?? 0,
        relationCount: relations.data?.results?.length ?? 0,
        entityTypes: [...new Set((entities.data?.results || []).map(m => extractEntityType(m.content)))],
      }, null, 2),
    };
  }

  // Template: seizn://memories/project/{name}
  const projectMatch = uri.match(/^seizn:\/\/memories\/project\/(.+)$/);
  if (projectMatch) {
    const projectName = decodeURIComponent(projectMatch[1]);
    const data = await apiRequest(
      `/api/v1/memories?query=${encodeURIComponent(projectName)}&limit=20&mode=hybrid&namespace=${encodeURIComponent(projectName)}`
    );
    return { mimeType: "application/json", text: JSON.stringify(data, null, 2) };
  }

  // Template: seizn://context/{format}
  const contextMatch = uri.match(/^seizn:\/\/context\/(brief|detailed|extended)$/);
  if (contextMatch) {
    const format = contextMatch[1];
    const data = await apiRequest(`/api/context?format=${format}`) as { contextString?: string };
    return { mimeType: "text/plain", text: data.contextString || "" };
  }

  // Template: seizn://docs/setup/{editor}
  const docsMatch = uri.match(/^seizn:\/\/docs\/setup\/(.+)$/);
  if (docsMatch) {
    const editor = decodeURIComponent(docsMatch[1]);
    const doc = EDITOR_DOCS[editor];
    if (!doc) {
      throw new Error(`Unknown editor: ${editor}. Available: ${Object.keys(EDITOR_DOCS).join(", ")}`);
    }
    return { mimeType: "text/markdown", text: doc };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

// Register MCP handlers on a Server instance
function registerHandlers(server: Server) {
  // ── Tools ──────────────────────────────────────────────────────────────────
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await dispatchTool(name, args as Record<string, unknown>, server);
      return { content: [{ type: "text", text: result }] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: JSON.stringify({ error: errorMessage }) }],
        isError: true,
      };
    }
  });

  // ── Resources ──────────────────────────────────────────────────────────────
  server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
    const paginated = paginateByCursor(RESOURCE_DEFINITIONS, request.params?.cursor, 2);
    return {
      resources: paginated.items,
      ...(paginated.nextCursor ? { nextCursor: paginated.nextCursor } : {}),
    };
  });

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async (request) => {
    const paginated = paginateByCursor(
      RESOURCE_TEMPLATE_DEFINITIONS,
      request.params?.cursor,
      2
    );
    return {
      resourceTemplates: paginated.items,
      ...(paginated.nextCursor ? { nextCursor: paginated.nextCursor } : {}),
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri;
    const result = await dispatchResource(uri);
    return { contents: [{ uri, mimeType: result.mimeType, text: result.text }] };
  });
}

// Create and run server
const HTTP_BODY_LIMIT_BYTES = 1_000_000;
const DEFAULT_HTTP_HOST = "127.0.0.1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function parseBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function resolveHttpHost(): string {
  const host = process.env.SEIZN_MCP_HOST || DEFAULT_HTTP_HOST;
  if (LOOPBACK_HOSTS.has(host)) {
    return host;
  }

  if (parseBooleanEnv(process.env.SEIZN_MCP_UNSAFE_HTTP)) {
    return host;
  }

  throw new Error(
    `Refusing to bind Seizn MCP HTTP server to non-loopback host "${host}". ` +
      "Set SEIZN_MCP_UNSAFE_HTTP=1 only if you also protect the port at the network boundary."
  );
}

function resolveHttpAuthToken(): { token: string; generated: boolean } {
  const configured = process.env.SEIZN_MCP_HTTP_TOKEN?.trim();
  if (configured) {
    return { token: configured, generated: false };
  }

  return {
    token: randomBytes(32).toString("base64url"),
    generated: true,
  };
}

function getAllowedHttpOrigins(port: number): Set<string> {
  const configured = process.env.SEIZN_MCP_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    ...configured,
  ]);
}

function setHttpCorsHeaders(
  req: { headers: { origin?: string | string[] } },
  res: { setHeader: (name: string, value: string) => void },
  allowedOrigins: Set<string>
): boolean {
  const originHeader = req.headers.origin;
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!origin) {
    return true;
  }

  if (!allowedOrigins.has(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Seizn-MCP-Token");
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
  return true;
}

function isAuthorizedHttpRequest(
  req: { headers: { authorization?: string | string[]; "x-seizn-mcp-token"?: string | string[] } },
  token: string
): boolean {
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const headerToken = Array.isArray(req.headers["x-seizn-mcp-token"])
    ? req.headers["x-seizn-mcp-token"][0]
    : req.headers["x-seizn-mcp-token"];
  const provided = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] || headerToken;
  if (!provided) {
    return false;
  }

  const expected = Buffer.from(token, "utf8");
  const actual = Buffer.from(provided, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readJsonRpcBody(req: AsyncIterable<Buffer | string>): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > HTTP_BODY_LIMIT_BYTES) {
      throw new Error("request_body_too_large");
    }
    chunks.push(buffer);
  }

  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("invalid_json_rpc_body");
  }
  return body as Record<string, unknown>;
}

async function main() {
  const httpMode = process.argv.includes('--http');
  const port = parseInt(process.env.SEIZN_MCP_PORT || '3100', 10);

  const server = new Server(
    {
      name: "seizn-memory",
      version: "3.0.0", // v3.0: Resources + Webhooks + Config Sync + OAuth + Auto Context
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  registerHandlers(server);

  if (httpMode) {
    // HTTP transport mode
    const { createServer } = await import('node:http');
    const host = resolveHttpHost();
    const httpAuth = resolveHttpAuthToken();
    const allowedHttpOrigins = getAllowedHttpOrigins(port);

    const httpServer = createServer(async (req, res) => {
      const corsAllowed = setHttpCorsHeaders(req, res, allowedHttpOrigins);
      if (!corsAllowed) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin not allowed' }));
        return;
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://${host}:${port}`);

      // Health endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'healthy',
          version: '3.0.0',
          transport: 'http',
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // MCP JSON-RPC endpoint
      if (url.pathname === '/mcp' && req.method === 'POST') {
        try {
          if (!isAuthorizedHttpRequest(req, httpAuth.token)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32001, message: 'Unauthorized' },
            }));
            return;
          }

          const body = await readJsonRpcBody(req);

          if (body.method === 'tools/list') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: { tools },
            }));
            return;
          }

          if (body.method === 'tools/call') {
            const params = body.params as { name?: string; arguments?: Record<string, unknown> } | undefined;
            const name = params?.name;
            if (!name) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                error: { code: -32602, message: 'Invalid params' },
              }));
              return;
            }

            const result = await dispatchTool(name, params?.arguments, server);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: { content: [{ type: 'text', text: result }] },
            }));
            return;
          }

          if (body.method === 'resources/list') {
            const params = body.params as { cursor?: string | null } | undefined;
            const paginated = paginateByCursor(
              RESOURCE_DEFINITIONS,
              params?.cursor,
              2
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: {
                resources: paginated.items,
                ...(paginated.nextCursor ? { nextCursor: paginated.nextCursor } : {}),
              },
            }));
            return;
          }

          if (body.method === 'resources/templates/list') {
            const params = body.params as { cursor?: string | null } | undefined;
            const paginated = paginateByCursor(
              RESOURCE_TEMPLATE_DEFINITIONS,
              params?.cursor,
              2
            );
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: {
                resourceTemplates: paginated.items,
                ...(paginated.nextCursor ? { nextCursor: paginated.nextCursor } : {}),
              },
            }));
            return;
          }

          if (body.method === 'resources/read') {
            const params = body.params as { uri?: string } | undefined;
            if (!params?.uri) {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                error: { code: -32602, message: 'Invalid params' },
              }));
              return;
            }

            const resourceResult = await dispatchResource(params.uri);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              jsonrpc: '2.0', id: body.id,
              result: { contents: [{ uri: params.uri, mimeType: resourceResult.mimeType, text: resourceResult.text }] },
            }));
            return;
          }

          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const status = message === "request_body_too_large" ? 413 : 400;
          res.writeHead(status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: {
              code: status === 413 ? -32013 : -32700,
              message: status === 413 ? 'Request body too large' : 'Invalid JSON-RPC request',
            },
          }));
        }
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    httpServer.listen(port, host, () => {
      console.error(`Seizn MCP Server (HTTP) running on http://${host}:${port}`);
      console.error(`  MCP endpoint: POST http://${host}:${port}/mcp`);
      console.error(`  Health check: GET  http://${host}:${port}/health`);
      console.error(`  Authorization: Bearer ${httpAuth.token}`);
      if (httpAuth.generated) {
        console.error("  Set SEIZN_MCP_HTTP_TOKEN to use a stable HTTP transport token.");
      }
    });
  } else {
    // stdio transport (default)
    const transport = new ContentLengthStdioTransport();
    await server.connect(transport);
  }
}

main().catch(console.error);
