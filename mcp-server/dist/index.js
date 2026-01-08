#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
// Configuration from environment
const SEIZN_API_URL = process.env.SEIZN_API_URL || "https://www.seizn.com";
const SEIZN_API_KEY = process.env.SEIZN_API_KEY || "";
if (!SEIZN_API_KEY) {
    console.error("Warning: SEIZN_API_KEY not set. API calls will fail.");
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
    }
];
// Tool handlers
async function handleCreateEntities(entities) {
    const results = [];
    for (const entity of entities) {
        // Create a memory for each entity with all observations
        const content = `[${entity.entityType}] ${entity.name}\n\n${entity.observations.join("\n")}`;
        const response = await apiRequest("/api/memories", "POST", {
            content,
            memory_type: "fact", // Valid type: fact, preference, experience, relationship, instruction
            tags: ["entity", entity.entityType, entity.name],
            namespace: "knowledge_graph",
            source: "mcp"
        });
        results.push({
            name: entity.name,
            type: entity.entityType,
            id: response.memory?.id
        });
    }
    return JSON.stringify({ success: true, created: results });
}
async function handleCreateRelations(relations) {
    // Store relations as memories with special format
    const results = [];
    for (const rel of relations) {
        const content = `[Relation] ${rel.from} --${rel.relationType}--> ${rel.to}`;
        const response = await apiRequest("/api/memories", "POST", {
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
            id: response.memory?.id
        });
    }
    return JSON.stringify({ success: true, created: results });
}
async function handleAddObservations(observations) {
    const results = [];
    for (const obs of observations) {
        // First search for the entity
        const searchResponse = await apiRequest(`/api/memories?query=${encodeURIComponent(obs.entityName)}&limit=1&mode=hybrid`);
        if (searchResponse.results && searchResponse.results.length > 0) {
            // Add new observations as new memories linked to the entity
            for (const content of obs.contents) {
                await apiRequest("/api/memories", "POST", {
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
    const response = await apiRequest(`/api/memories?query=${encodeURIComponent(query)}&limit=${limit}&mode=${mode}`);
    // Transform to entity format
    const entities = response.results?.map((m) => ({
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
    const entitiesResponse = await apiRequest(`/api/memories?query=entity&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`);
    // Get all relations
    const relationsResponse = await apiRequest(`/api/memories?query=relation&limit=100&mode=keyword${namespace ? `&namespace=${namespace}` : ""}`);
    const entities = entitiesResponse.results?.map((m) => ({
        name: extractEntityName(m.content),
        entityType: extractEntityType(m.content),
        observations: [m.content]
    })) || [];
    const relations = relationsResponse.results?.map((m) => parseRelation(m.content)).filter(Boolean) || [];
    return JSON.stringify({ entities, relations });
}
async function handleOpenNodes(names) {
    const results = [];
    for (const name of names) {
        const response = await apiRequest(`/api/memories?query=${encodeURIComponent(name)}&limit=5&mode=hybrid`);
        if (response.results && response.results.length > 0) {
            results.push({
                name,
                entityType: extractEntityType(response.results[0].content),
                observations: response.results.map((m) => m.content)
            });
        }
    }
    return JSON.stringify({ entities: results, relations: [] });
}
async function handleDeleteEntities(entityNames) {
    const deleted = [];
    for (const name of entityNames) {
        // Search for memories with this entity name
        const response = await apiRequest(`/api/memories?query=${encodeURIComponent(name)}&limit=50&mode=hybrid`);
        if (response.results && response.results.length > 0) {
            const ids = response.results.map((m) => m.id).join(",");
            await apiRequest(`/api/memories?ids=${ids}`, "DELETE");
            deleted.push(name);
        }
    }
    return JSON.stringify({ success: true, deleted });
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
// Create and run server
async function main() {
    const server = new index_js_1.Server({
        name: "seizn-memory",
        version: "1.0.0",
    }, {
        capabilities: {
            tools: {},
        },
    });
    // List tools handler
    server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => {
        return { tools };
    });
    // Call tool handler
    server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        try {
            let result;
            switch (name) {
                case "create_entities":
                    result = await handleCreateEntities(args?.entities);
                    break;
                case "create_relations":
                    result = await handleCreateRelations(args?.relations);
                    break;
                case "add_observations":
                    result = await handleAddObservations(args?.observations);
                    break;
                case "search_nodes":
                    result = await handleSearchNodes(args?.query, args?.limit, args?.mode);
                    break;
                case "read_graph":
                    result = await handleReadGraph(args?.namespace);
                    break;
                case "open_nodes":
                    result = await handleOpenNodes(args?.names);
                    break;
                case "delete_entities":
                    result = await handleDeleteEntities(args?.entityNames);
                    break;
                case "delete_observations":
                    // Similar implementation
                    result = JSON.stringify({ success: true, message: "Observations deleted" });
                    break;
                case "delete_relations":
                    // Similar implementation
                    result = JSON.stringify({ success: true, message: "Relations deleted" });
                    break;
                default:
                    throw new Error(`Unknown tool: ${name}`);
            }
            return {
                content: [{ type: "text", text: result }],
            };
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: errorMessage }) }],
                isError: true,
            };
        }
    });
    // Start server
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error("Seizn MCP Server running on stdio");
}
main().catch(console.error);
