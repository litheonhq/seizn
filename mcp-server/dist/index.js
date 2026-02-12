#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// Force UTF-8 encoding for Windows compatibility
if (process.platform === 'win32') {
    const { execSync } = require('child_process');
    try {
        execSync('chcp 65001', { stdio: 'ignore' });
    }
    catch { }
}
// Ensure stdin uses UTF-8
process.stdin.setEncoding('utf8');
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
// Configuration from environment
const SEIZN_API_URL = process.env.SEIZN_API_URL || "https://www.seizn.com";
let SEIZN_API_KEY = process.env.SEIZN_API_KEY || "";
// ─── Credential Helpers (OAuth Device Flow) ──────────────────────────────────
function getCredentialsPath() {
    return path.join(os.homedir(), ".seizn", "credentials.json");
}
function loadCredentials() {
    try {
        const credPath = getCredentialsPath();
        if (fs.existsSync(credPath)) {
            const creds = JSON.parse(fs.readFileSync(credPath, "utf-8"));
            if (creds.access_token && (!creds.expires_at || creds.expires_at > Date.now())) {
                return creds.access_token;
            }
        }
    }
    catch { }
    return null;
}
function saveCredentials(token, expiresIn) {
    const credDir = path.join(os.homedir(), ".seizn");
    fs.mkdirSync(credDir, { recursive: true });
    fs.writeFileSync(path.join(credDir, "credentials.json"), JSON.stringify({
        access_token: token,
        expires_at: Date.now() + expiresIn * 1000,
        created_at: new Date().toISOString(),
    }, null, 2), "utf-8");
}
// Try loading from credentials file if env not set
if (!SEIZN_API_KEY) {
    SEIZN_API_KEY = loadCredentials() || "";
}
if (!SEIZN_API_KEY) {
    console.error("Warning: SEIZN_API_KEY not set and no saved credentials found. Run auth_login tool to authenticate.");
}
// Content-Length framed transport (Claude/Codex clients expect this framing)
class ContentLengthStdioTransport {
    stdin;
    stdout;
    buffer = Buffer.alloc(0);
    onmessage;
    onerror;
    onclose;
    constructor(stdin = process.stdin, stdout = process.stdout) {
        this.stdin = stdin;
        this.stdout = stdout;
    }
    handleError = (error) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.onerror?.(err);
    };
    handleData = (chunk) => {
        const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
        this.buffer = Buffer.concat([this.buffer, incoming]);
        this.processBuffer();
    };
    processBuffer() {
        while (true) {
            const headerEnd = this.buffer.indexOf("\r\n\r\n");
            // Fallback: accept bare newline-delimited JSON if no headers are present
            if (headerEnd === -1) {
                const newlineIndex = this.buffer.indexOf("\n");
                if (newlineIndex === -1)
                    return;
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
            if (this.buffer.length < messageEnd)
                return;
            const jsonText = this.buffer.slice(messageStart, messageEnd).toString("utf8");
            this.buffer = this.buffer.slice(messageEnd);
            this.safeHandle(jsonText);
        }
    }
    safeHandle(raw) {
        try {
            const message = JSON.parse(raw);
            this.onmessage?.(message);
        }
        catch (error) {
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
    async send(message) {
        const json = JSON.stringify(message);
        const payload = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
        await new Promise((resolve) => {
            if (this.stdout.write(payload)) {
                resolve();
            }
            else {
                this.stdout.once("drain", () => resolve());
            }
        });
    }
}
// API Helper
async function apiRequest(endpoint, method = "GET", body) {
    const url = `${SEIZN_API_URL}${endpoint}`;
    const headers = {
        "Content-Type": "application/json; charset=utf-8",
        "x-api-key": SEIZN_API_KEY,
    };
    const options = {
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
const tools = [
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
async function handleCreateEntities(entities) {
    const results = [];
    for (const entity of entities) {
        // Create a memory for each entity with all observations
        const content = `[${entity.entityType}] ${entity.name}\n\n${entity.observations.join("\n")}`;
        const response = await apiRequest("/api/v1/memories", "POST", {
            content,
            memory_type: "fact", // Valid type: fact, preference, experience, relationship, instruction
            tags: ["entity", entity.entityType, entity.name],
            namespace: "knowledge_graph",
            source: "mcp"
        });
        results.push({
            name: entity.name,
            type: entity.entityType,
            id: response.data?.memory?.id
        });
    }
    return JSON.stringify({ success: true, created: results });
}
async function handleCreateRelations(relations) {
    // Store relations as memories with special format
    const results = [];
    for (const rel of relations) {
        const content = `[Relation] ${rel.from} --${rel.relationType}--> ${rel.to}`;
        const response = await apiRequest("/api/v1/memories", "POST", {
            content,
            memory_type: "relationship", // Valid type for relations
            tags: ["relation", rel.from, rel.to, rel.relationType],
            namespace: "knowledge_graph",
            source: "mcp"
        });
        results.push({
            from: rel.from,
            to: rel.to,
            type: rel.relationType,
            id: response.data?.memory?.id
        });
    }
    return JSON.stringify({ success: true, created: results });
}
async function handleAddObservations(observations) {
    const results = [];
    for (const obs of observations) {
        // First search for the entity
        const searchResponse = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(obs.entityName)}&limit=1&mode=hybrid`);
        if (searchResponse.data?.results && searchResponse.data.results.length > 0) {
            // Add new observations as new memories linked to the entity
            for (const content of obs.contents) {
                await apiRequest("/api/v1/memories", "POST", {
                    content: `[${obs.entityName}] ${content}`,
                    memory_type: "fact", // Valid type for observations
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
async function handleSearchNodes(query, limit = 10, mode = "vector") {
    const response = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(query)}&limit=${limit}&mode=${mode}`);
    // Transform to entity format
    const entities = response.data?.results?.map((m) => ({
        name: extractEntityName(m.content),
        type: m.memory_type,
        content: m.content,
        similarity: m.similarity,
        id: m.id
    })) || [];
    return JSON.stringify({ entities, relations: [] });
}
async function handleReadGraph(namespace) {
    // Get all entities
    const entitiesResponse = await apiRequest(`/api/v1/memories?query=entity&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`);
    // Get all relations
    const relationsResponse = await apiRequest(`/api/v1/memories?query=relation&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`);
    const entities = entitiesResponse.data?.results?.map((m) => ({
        name: extractEntityName(m.content),
        entityType: extractEntityType(m.content),
        observations: [m.content]
    })) || [];
    const relations = relationsResponse.data?.results?.map((m) => parseRelation(m.content)).filter(Boolean) || [];
    return JSON.stringify({ entities, relations });
}
async function handleOpenNodes(names) {
    const results = [];
    for (const name of names) {
        const response = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(name)}&limit=5&mode=hybrid`);
        if (response.data?.results && response.data.results.length > 0) {
            results.push({
                name,
                entityType: extractEntityType(response.data.results[0].content),
                observations: response.data.results.map((m) => m.content)
            });
        }
    }
    return JSON.stringify({ entities: results, relations: [] });
}
async function handleDeleteEntities(entityNames) {
    const deleted = [];
    for (const name of entityNames) {
        // Search for memories with this entity name
        const response = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(name)}&limit=50&mode=hybrid`);
        if (response.data?.results && response.data.results.length > 0) {
            const ids = response.data.results.map((m) => m.id).join(",");
            await apiRequest(`/api/v1/memories?ids=${ids}`, "DELETE");
            deleted.push(name);
        }
    }
    return JSON.stringify({ success: true, deleted });
}
async function handleDeleteObservations(deletions) {
    const results = [];
    for (const del of deletions) {
        let deletedCount = 0;
        for (const observation of del.observations) {
            // Search for memories matching this observation content
            const searchResponse = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(`[${del.entityName}] ${observation}`)}&limit=5&mode=hybrid`);
            const matches = searchResponse.data?.results?.filter((m) => m.content.includes(observation) && m.tags?.includes('observation')) || [];
            if (matches.length > 0) {
                const ids = matches.map((m) => m.id).join(",");
                await apiRequest(`/api/v1/memories?ids=${ids}`, "DELETE");
                deletedCount += matches.length;
            }
        }
        results.push({ entityName: del.entityName, deleted: deletedCount });
    }
    return JSON.stringify({ success: true, results });
}
async function handleDeleteRelations(relations) {
    const deleted = [];
    for (const rel of relations) {
        // Relations are stored as memories with tags
        const query = `${rel.from} ${rel.relationType} ${rel.to}`;
        const searchResponse = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(query)}&limit=10&mode=hybrid`);
        const matches = searchResponse.data?.results?.filter((m) => m.content.includes(rel.from) &&
            m.content.includes(rel.to) &&
            m.tags?.includes('relation')) || [];
        if (matches.length > 0) {
            const ids = matches.map((m) => m.id).join(",");
            await apiRequest(`/api/v1/memories?ids=${ids}`, "DELETE");
            deleted.push({ from: rel.from, to: rel.to, relationType: rel.relationType });
        }
    }
    return JSON.stringify({ success: true, deleted });
}
async function handleGetContext(options = {}) {
    const params = new URLSearchParams();
    if (options.format)
        params.append("format", options.format);
    if (options.query)
        params.append("query", options.query);
    if (options.includeProfile !== undefined)
        params.append("includeProfile", String(options.includeProfile));
    if (options.includeGraph !== undefined)
        params.append("includeGraph", String(options.includeGraph));
    if (options.tierStrategy)
        params.append("tierStrategy", options.tierStrategy);
    if (options.maxTokens)
        params.append("maxTokens", String(options.maxTokens));
    const response = await apiRequest(`/api/context?${params.toString()}`);
    return JSON.stringify({
        success: true,
        contextString: response.contextString,
        tokenCount: response.tokenCount,
        factsIncluded: Array.isArray(response.facts) ? response.facts.length : 0,
        metadata: response.metadata
    });
}
async function handleFlushMemories(options = {}) {
    const response = await apiRequest("/api/memories/flush", "POST", options);
    return JSON.stringify({
        success: response.success,
        processed: response.processed,
        processingMs: response.processingMs
    });
}
async function handleGetProfile(options = {}) {
    const endpoint = options.history
        ? "/api/v1/profile?history=true"
        : "/api/v1/profile";
    const response = await apiRequest(endpoint);
    return JSON.stringify({ success: true, ...response });
}
async function handleUpdateProfile(options) {
    const response = await apiRequest("/api/v1/profile", "PUT", options);
    return JSON.stringify({
        success: true,
        profile: response,
    });
}
async function handleDeriveProfile() {
    const response = await apiRequest("/api/v1/profile/derive", "POST");
    return JSON.stringify({
        success: true,
        profile: response,
    });
}
async function handleSyncConnector(options) {
    const endpoint = options.connectionId
        ? `/api/connectors/${options.connectorType}/sync?connectionId=${options.connectionId}`
        : `/api/connectors/${options.connectorType}/sync`;
    const response = await apiRequest(endpoint, "POST", {
        force: options.force || false
    });
    return JSON.stringify({
        success: response.success,
        connectorType: options.connectorType,
        synced: response.synced ?? 0,
        skipped: response.skipped ?? 0,
        failed: response.failed ?? 0,
        errors: response.errors ?? []
    });
}
async function handleListConnectors(connectorType) {
    const endpoint = connectorType
        ? `/api/connectors?type=${connectorType}`
        : "/api/connectors";
    const response = await apiRequest(endpoint);
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
async function handleHealthCheck(verbose = false) {
    const startTime = Date.now();
    const diagnostics = {
        server: "seizn-mcp",
        version: "3.0.0",
        transport: process.argv.includes('--http') ? 'http' : 'stdio',
        timestamp: new Date().toISOString(),
    };
    try {
        const response = await apiRequest("/api/v1/profile");
        diagnostics.api = {
            status: "healthy",
            url: SEIZN_API_URL,
            latencyMs: Date.now() - startTime,
            authenticated: response.success === true,
        };
    }
    catch (error) {
        diagnostics.api = {
            status: "degraded",
            url: SEIZN_API_URL,
            latencyMs: Date.now() - startTime,
            error: error.message,
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
    const overallStatus = diagnostics.api?.status === "healthy" ? "healthy" : "degraded";
    return JSON.stringify({ status: overallStatus, ...diagnostics });
}
// ─── Project Detection ───────────────────────────────────────────────────────
function detectProject(cwd) {
    // Try package.json
    try {
        const pkgPath = path.join(cwd, "package.json");
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
            if (pkg.name)
                return pkg.name;
        }
    }
    catch { }
    // Try pyproject.toml
    try {
        const pyprojectPath = path.join(cwd, "pyproject.toml");
        if (fs.existsSync(pyprojectPath)) {
            const content = fs.readFileSync(pyprojectPath, "utf-8");
            const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
            if (nameMatch)
                return nameMatch[1];
        }
    }
    catch { }
    // Try Cargo.toml
    try {
        const cargoPath = path.join(cwd, "Cargo.toml");
        if (fs.existsSync(cargoPath)) {
            const content = fs.readFileSync(cargoPath, "utf-8");
            const nameMatch = content.match(/^name\s*=\s*"(.+?)"/m);
            if (nameMatch)
                return nameMatch[1];
        }
    }
    catch { }
    // Fallback: directory name
    return path.basename(cwd);
}
async function handleSessionInit(options = {}) {
    const hoursBack = options.hoursBack || 24;
    const limit = options.limit || 20;
    const sections = [];
    // 0. Auto-detect project from cwd
    let detectedProject = null;
    if (options.cwd && options.autoDetectProject !== false) {
        detectedProject = detectProject(options.cwd);
        if (detectedProject) {
            sections.push(`## Detected Project: ${detectedProject}\nWorking directory: ${options.cwd}`);
        }
    }
    const effectiveNamespace = options.namespace || detectedProject || undefined;
    // 1. Load user profile
    try {
        const profileResponse = await apiRequest("/api/v1/profile");
        if (profileResponse.success && profileResponse.profile) {
            sections.push(`## User Profile\n${JSON.stringify(profileResponse.profile, null, 2)}`);
        }
    }
    catch {
        sections.push("## User Profile\n(Could not load profile)");
    }
    // 2. Load recent memories (with project namespace filter)
    try {
        const nsParam = effectiveNamespace ? `&namespace=${encodeURIComponent(effectiveNamespace)}` : "";
        const recentResponse = await apiRequest(`/api/v1/memories?query=recent&limit=${limit}&mode=keyword${nsParam}`);
        if (recentResponse.data?.results && recentResponse.data.results.length > 0) {
            const memorySummary = recentResponse.data.results.map(m => `- [${m.memory_type}] ${m.content}${m.tags?.length ? ` (tags: ${m.tags.join(', ')})` : ''}`).join('\n');
            sections.push(`## Recent Memories (last ${hoursBack}h)${effectiveNamespace ? ` [${effectiveNamespace}]` : ""}\n${memorySummary}`);
        }
        else {
            sections.push(`## Recent Memories\nNo recent memories found.`);
        }
    }
    catch {
        sections.push("## Recent Memories\n(Could not load memories)");
    }
    // 3. Load project-specific instructions (if project detected)
    if (detectedProject) {
        try {
            const instrResponse = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(`instructions for ${detectedProject}`)}&limit=10&mode=hybrid`);
            const instructions = instrResponse.data?.results?.filter((m) => m.memory_type === "instruction" || m.memory_type === "preference") || [];
            if (instructions.length > 0) {
                const instrSummary = instructions.map(m => `- ${m.content}`).join('\n');
                sections.push(`## Project Instructions (${detectedProject})\n${instrSummary}`);
            }
        }
        catch { }
    }
    // 4. Get context summary
    try {
        const contextResponse = await apiRequest("/api/context?format=brief");
        if (contextResponse.contextString) {
            sections.push(`## Context Summary\n${contextResponse.contextString}`);
        }
    }
    catch {
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
async function handleCreateWebhook(args) {
    const response = await apiRequest("/api/webhooks", "POST", {
        name: args.name,
        url: args.url,
        events: args.events || ["memory.created"],
        namespace: args.namespace,
    });
    return JSON.stringify(response);
}
async function handleListWebhooks() {
    const response = await apiRequest("/api/webhooks");
    return JSON.stringify(response);
}
async function handleDeleteWebhook(id) {
    const response = await apiRequest(`/api/webhooks?id=${encodeURIComponent(id)}`, "DELETE");
    return JSON.stringify(response);
}
async function handleWebhookDeliveries(args) {
    const params = new URLSearchParams();
    if (args.webhook_id)
        params.append("webhook_id", args.webhook_id);
    if (args.status)
        params.append("status", args.status);
    if (args.limit)
        params.append("limit", String(args.limit));
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
];
function formatConfigContent(memories, formatId, project) {
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
async function fetchMemoriesForSync(project) {
    const nsParam = project ? `&namespace=${encodeURIComponent(project)}` : "";
    const [instrRes, prefRes, factRes] = await Promise.all([
        apiRequest(`/api/v1/memories?query=instruction&limit=50&mode=keyword${nsParam}`),
        apiRequest(`/api/v1/memories?query=preference&limit=50&mode=keyword${nsParam}`),
        apiRequest(`/api/v1/memories?query=fact&limit=50&mode=keyword${nsParam}`),
    ]);
    return {
        instructions: (instrRes.data?.results || []).filter(m => m.memory_type === "instruction").map(m => m.content),
        preferences: (prefRes.data?.results || []).filter(m => m.memory_type === "preference").map(m => m.content),
        facts: (factRes.data?.results || []).filter(m => m.memory_type === "fact").map(m => m.content).slice(0, 20),
    };
}
async function handleListConfigFormats() {
    return JSON.stringify({ formats: CONFIG_FORMATS });
}
async function handleSyncConfigFiles(args) {
    const targetFormats = args.formats?.length
        ? CONFIG_FORMATS.filter(f => args.formats.includes(f.id))
        : [...CONFIG_FORMATS];
    if (targetFormats.length === 0) {
        return JSON.stringify({ success: false, error: "No matching formats found" });
    }
    if (args.direction === "push") {
        // Seizn → local files
        const memories = await fetchMemoriesForSync(args.project);
        const results = [];
        for (const fmt of targetFormats) {
            const content = formatConfigContent(memories, fmt.id, args.project);
            const filePath = path.join(args.cwd, fmt.file);
            if (args.dryRun) {
                results.push({ file: fmt.file, path: filePath, content, written: false });
            }
            else {
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
        const results = [];
        for (const fmt of targetFormats) {
            const filePath = path.join(args.cwd, fmt.file);
            if (!fs.existsSync(filePath))
                continue;
            const content = fs.readFileSync(filePath, "utf-8");
            if (!content.trim())
                continue;
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
async function handleAuthLogin(force = false) {
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
    const deviceData = await deviceResponse.json();
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
            const tokenData = await tokenResponse.json();
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
        }
        catch { }
    }
    return JSON.stringify({ success: false, error: "Authentication timed out.", instructions: message });
}
// Helper functions
function extractEntityName(content) {
    const match = content.match(/\[.*?\]\s*(.+?)(?:\n|$)/);
    return match ? match[1].trim() : content.substring(0, 50);
}
function extractEntityType(content) {
    const match = content.match(/\[(.+?)\]/);
    return match ? match[1] : "unknown";
}
function parseRelation(content) {
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
const EDITOR_DOCS = {
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
async function dispatchTool(name, args) {
    switch (name) {
        case "get_context":
            return handleGetContext(args);
        case "flush_memories":
            return handleFlushMemories(args);
        case "get_profile":
            return handleGetProfile(args);
        case "update_profile":
            return handleUpdateProfile(args);
        case "derive_profile":
            return handleDeriveProfile();
        case "health_check":
            return handleHealthCheck(args?.verbose);
        case "session_init":
            return handleSessionInit(args);
        case "sync_connector":
            return handleSyncConnector(args);
        case "list_connectors":
            return handleListConnectors(args?.connectorType);
        case "create_entities":
            return handleCreateEntities(args?.entities);
        case "create_relations":
            return handleCreateRelations(args?.relations);
        case "add_observations":
            return handleAddObservations(args?.observations);
        case "search_nodes":
            return handleSearchNodes(args?.query, args?.limit, args?.mode);
        case "read_graph":
            return handleReadGraph(args?.namespace);
        case "open_nodes":
            return handleOpenNodes(args?.names);
        case "delete_entities":
            return handleDeleteEntities(args?.entityNames);
        case "delete_observations":
            return handleDeleteObservations(args?.deletions);
        case "delete_relations":
            return handleDeleteRelations(args?.relations);
        // Webhook tools
        case "create_webhook":
            return handleCreateWebhook(args);
        case "list_webhooks":
            return handleListWebhooks();
        case "delete_webhook":
            return handleDeleteWebhook(args?.id);
        case "webhook_deliveries":
            return handleWebhookDeliveries(args);
        // Config sync tools
        case "list_config_formats":
            return handleListConfigFormats();
        case "sync_config_files":
            return handleSyncConfigFiles(args);
        // Auth tool
        case "auth_login":
            return handleAuthLogin(args?.force);
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// ─── Resource dispatch (used by both stdio and HTTP) ─────────────────────────
async function dispatchResource(uri) {
    if (uri === "seizn://memories/recent") {
        const data = await apiRequest("/api/v1/memories?query=recent&limit=10&mode=keyword");
        return { mimeType: "application/json", text: JSON.stringify(data, null, 2) };
    }
    if (uri === "seizn://profile") {
        const data = await apiRequest("/api/v1/profile");
        return { mimeType: "application/json", text: JSON.stringify(data, null, 2) };
    }
    if (uri === "seizn://graph/summary") {
        const entities = await apiRequest("/api/v1/memories?query=entity&limit=100&mode=keyword");
        const relations = await apiRequest("/api/v1/memories?query=relation&limit=100&mode=keyword");
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
        const data = await apiRequest(`/api/v1/memories?query=${encodeURIComponent(projectName)}&limit=20&mode=hybrid&namespace=${encodeURIComponent(projectName)}`);
        return { mimeType: "application/json", text: JSON.stringify(data, null, 2) };
    }
    // Template: seizn://context/{format}
    const contextMatch = uri.match(/^seizn:\/\/context\/(brief|detailed|extended)$/);
    if (contextMatch) {
        const format = contextMatch[1];
        const data = await apiRequest(`/api/context?format=${format}`);
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
function registerHandlers(server) {
    // ── Tools ──────────────────────────────────────────────────────────────────
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        return { tools };
    });
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            const result = await dispatchTool(name, args);
            return { content: [{ type: "text", text: result }] };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: errorMessage }) }],
                isError: true,
            };
        }
    });
    // ── Resources ──────────────────────────────────────────────────────────────
    server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => {
        return {
            resources: [
                { uri: "seizn://memories/recent", name: "Recent Memories", description: "Last 10 memories", mimeType: "application/json" },
                { uri: "seizn://profile", name: "User Profile", description: "Structured user profile", mimeType: "application/json" },
                { uri: "seizn://graph/summary", name: "Knowledge Graph Summary", description: "Entity and relation counts", mimeType: "application/json" },
            ],
        };
    });
    server.setRequestHandler(types_js_1.ListResourceTemplatesRequestSchema, async () => {
        return {
            resourceTemplates: [
                { uriTemplate: "seizn://memories/project/{name}", name: "Project Memories", description: "Memories filtered by project namespace" },
                { uriTemplate: "seizn://context/{format}", name: "Formatted Context", description: "Pre-formatted LLM context (brief/detailed/extended)" },
                { uriTemplate: "seizn://docs/setup/{editor}", name: "Editor Setup Guide", description: "Setup guide for AI editors (claude-code, cursor, windsurf, copilot, cline, aider, codex)" },
            ],
        };
    });
    server.setRequestHandler(types_js_1.ReadResourceRequestSchema, async (request) => {
        const uri = request.params.uri;
        const result = await dispatchResource(uri);
        return { contents: [{ uri, mimeType: result.mimeType, text: result.text }] };
    });
}
// Create and run server
async function main() {
    const httpMode = process.argv.includes('--http');
    const port = parseInt(process.env.SEIZN_MCP_PORT || '3100', 10);
    const server = new index_js_1.Server({
        name: "seizn-memory",
        version: "3.0.0", // v3.0: Resources + Webhooks + Config Sync + OAuth + Auto Context
    }, {
        capabilities: {
            tools: {},
            resources: {},
        },
    });
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
                    version: '3.0.0',
                    transport: 'http',
                    timestamp: new Date().toISOString(),
                }));
                return;
            }
            // MCP JSON-RPC endpoint
            if (url.pathname === '/mcp' && req.method === 'POST') {
                try {
                    const chunks = [];
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
                    if (body.method === 'resources/list') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0', id: body.id,
                            result: {
                                resources: [
                                    { uri: "seizn://memories/recent", name: "Recent Memories", mimeType: "application/json" },
                                    { uri: "seizn://profile", name: "User Profile", mimeType: "application/json" },
                                    { uri: "seizn://graph/summary", name: "Knowledge Graph Summary", mimeType: "application/json" },
                                ],
                            },
                        }));
                        return;
                    }
                    if (body.method === 'resources/templates/list') {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0', id: body.id,
                            result: {
                                resourceTemplates: [
                                    { uriTemplate: "seizn://memories/project/{name}", name: "Project Memories" },
                                    { uriTemplate: "seizn://context/{format}", name: "Formatted Context" },
                                    { uriTemplate: "seizn://docs/setup/{editor}", name: "Editor Setup Guide" },
                                ],
                            },
                        }));
                        return;
                    }
                    if (body.method === 'resources/read') {
                        const resourceResult = await dispatchResource(body.params.uri);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            jsonrpc: '2.0', id: body.id,
                            result: { contents: [{ uri: body.params.uri, mimeType: resourceResult.mimeType, text: resourceResult.text }] },
                        }));
                        return;
                    }
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } }));
                }
                catch (error) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: error.message }));
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
    }
    else {
        // stdio transport (default)
        const transport = new ContentLengthStdioTransport();
        await server.connect(transport);
        console.error("Seizn MCP Server running on stdio");
    }
}
main().catch(console.error);
