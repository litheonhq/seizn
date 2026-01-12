const fs = require('fs');
const path = require('path');

// Full endpoints structure that all languages need
const fullEndpoints = {
  title: "API Endpoints",
  requestBody: "Request Body",
  queryParams: "Query Parameters",
  response: "Response",
  postMemories: {
    description: "Add a new memory to the user's memory store.",
    content: "string (required) - The memory content",
    memoryType: "string - Type: fact, preference, experience, relationship, instruction",
    tags: "string[] - Tags for categorization",
    namespace: "string - Namespace for organization (default: \"default\")",
    scope: "string - Scope: user, session, agent",
    sessionId: "string - Session ID for session-scoped memories",
    agentId: "string - Agent ID for agent-scoped memories"
  },
  getMemories: {
    description: "Search memories using semantic similarity.",
    query: "string (required) - Search query",
    limit: "number - Max results (default: 10, max: 100)",
    threshold: "number - Similarity threshold 0-1 (default: 0.7)",
    namespace: "string - Filter by namespace"
  },
  deleteMemories: {
    description: "Delete memories by their IDs.",
    ids: "string (required) - Comma-separated memory IDs"
  },
  extract: {
    description: "Extract and store memories from a conversation using AI.",
    conversation: "string (required) - The conversation text to extract memories from",
    model: "string - AI model: haiku (faster) or sonnet (better) (default: haiku)",
    autoStore: "boolean - Automatically store extracted memories (default: true)",
    namespace: "string - Namespace for stored memories (default: \"default\")"
  },
  query: {
    description: "Get AI-generated responses using relevant memories as context (RAG).",
    queryParam: "string (required) - The user's question or prompt",
    model: "string - AI model: haiku or sonnet (default: haiku)",
    topK: "number - Number of memories to use as context (default: 5)",
    namespace: "string - Filter memories by namespace",
    includeMemories: "boolean - Include used memories in response (default: true)"
  }
};

const dictPath = path.join(__dirname, '../src/i18n/dictionaries');
const files = fs.readdirSync(dictPath).filter(f => f.endsWith('.json') && f !== 'en.json');

files.forEach(file => {
  const filePath = path.join(dictPath, file);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (data.docs && data.docs.endpoints) {
      // Merge with full structure, keeping translated values where they exist
      data.docs.endpoints = {
        ...fullEndpoints,
        ...data.docs.endpoints,
        postMemories: { ...fullEndpoints.postMemories, ...(data.docs.endpoints.postMemories || {}) },
        getMemories: { ...fullEndpoints.getMemories, ...(data.docs.endpoints.getMemories || {}) },
        deleteMemories: { ...fullEndpoints.deleteMemories, ...(data.docs.endpoints.deleteMemories || {}) },
        extract: { ...fullEndpoints.extract, ...(data.docs.endpoints.extract || {}) },
        query: { ...fullEndpoints.query, ...(data.docs.endpoints.query || {}) },
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      console.log(`Fixed ${file}`);
    }
  } catch (err) {
    console.error(`Error fixing ${file}:`, err.message);
  }
});

console.log('Done!');
