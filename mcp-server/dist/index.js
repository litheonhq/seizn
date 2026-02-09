#!/usr/bin/env node
"use strict";
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
// Configuration from environment
const SEIZN_API_URL = process.env.SEIZN_API_URL || "https://www.seizn.com";
const SEIZN_API_KEY = process.env.SEIZN_API_KEY || "";
if (!SEIZN_API_KEY) {
    console.error("Warning: SEIZN_API_KEY not set. API calls will fail.");
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
        description: "Initialize a new session by loading recent context: user profile, recent memories, and session summary. Call this at the start of every new conversation to ensure continuity.",
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
                }
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
        version: "2.4.0",
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
async function handleSessionInit(options = {}) {
    const hoursBack = options.hoursBack || 24;
    const limit = options.limit || 20;
    const sections = [];
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
    // 2. Load recent memories
    try {
        const recentResponse = await apiRequest(`/api/v1/memories?query=recent&limit=${limit}&mode=keyword`);
        if (recentResponse.data?.results && recentResponse.data.results.length > 0) {
            const memorySummary = recentResponse.data.results.map(m => `- [${m.memory_type}] ${m.content}${m.tags?.length ? ` (tags: ${m.tags.join(', ')})` : ''}`).join('\n');
            sections.push(`## Recent Memories (last ${hoursBack}h)\n${memorySummary}`);
        }
        else {
            sections.push(`## Recent Memories\nNo recent memories found.`);
        }
    }
    catch {
        sections.push("## Recent Memories\n(Could not load memories)");
    }
    // 3. Get context summary
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
        sessionContext: sections.join('\n\n'),
        memoriesLoaded: sections.length > 1,
        timestamp: new Date().toISOString(),
    });
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
            return JSON.stringify({ success: true, message: "Observations deleted" });
        case "delete_relations":
            return JSON.stringify({ success: true, message: "Relations deleted" });
        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}
// Register MCP handlers on a Server instance
function registerHandlers(server) {
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
}
// Create and run server
async function main() {
    const httpMode = process.argv.includes('--http');
    const port = parseInt(process.env.SEIZN_MCP_PORT || '3100', 10);
    const server = new index_js_1.Server({
        name: "seizn-memory",
        version: "2.4.0", // v2.2: Health check + HTTP transport
    }, {
        capabilities: {
            tools: {},
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
                    version: '2.4.0',
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
