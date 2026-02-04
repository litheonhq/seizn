# Seizn LangChain Connector

LangChain/LangGraph integration for Seizn's memory and retrieval systems.

## Overview

The Seizn LangChain Connector provides three main components:

| Component | LangChain Interface | Seizn Backend |
|-----------|---------------------|---------------|
| `SeizRetriever` | `BaseRetriever` | Summer RAG Stack |
| `SeizMemory` | `BaseChatMemory` | Spring Memory API |
| `SeizCallbackHandler` | `BaseCallbackHandler` | Flight Recorder |

## Installation

The connector is included in the Seizn SDK. Import from:

```typescript
import {
  SeizRetriever,
  SeizMemory,
  SeizCallbackHandler,
} from '@/lib/integrations/langchain';
```

## Quick Start

### Basic Usage with LangChain

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { RetrievalQAChain } from 'langchain/chains';
import {
  SeizRetriever,
  SeizMemory,
  SeizCallbackHandler,
} from '@/lib/integrations/langchain';

// Initialize components
const retriever = new SeizRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'my-knowledge-base',
  userId: 'user-123',
  mode: 'hybrid',
  topK: 5,
});

const memory = new SeizMemory({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',
  userId: 'user-123',
  sessionId: 'session-456',
});

const handler = new SeizCallbackHandler({
  apiKey: process.env.SEIZN_API_KEY!,
  userId: 'user-123',
  plan: 'pro',
});

// Create LLM
const llm = new ChatOpenAI({
  modelName: 'gpt-4',
  temperature: 0,
});

// Build chain
const chain = RetrievalQAChain.fromLLM(llm, retriever, {
  memory,
  callbacks: [handler],
});

// Run query
const result = await chain.invoke({
  query: 'How do I configure the API?',
});
```

---

## SeizRetriever

A LangChain-compatible retriever using Seizn's Summer RAG stack.

### Configuration

```typescript
interface SeizRetrieverConfig {
  apiKey: string;           // Required: Seizn API key
  collectionId: string;     // Required: Collection to search
  userId: string;           // Required: User ID for scoping
  baseUrl?: string;         // Default: https://www.seizn.com/api
  mode?: 'vector' | 'keyword' | 'hybrid';  // Default: hybrid
  topK?: number;            // Default: 5
  threshold?: number;       // Default: 0.7 (0-1)
  rerank?: boolean;         // Default: true
  federated?: boolean;      // Default: false
  autopilot?: boolean;      // Default: true
  timeout?: number;         // Default: 30000ms
  enableTracing?: boolean;  // Default: false
}
```

### Basic Retrieval

```typescript
const retriever = new SeizRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'docs',
  userId: 'user-123',
});

// Get relevant documents
const docs = await retriever.getRelevantDocuments(
  'How do I authenticate?'
);

// Each document contains:
// - pageContent: The text content
// - metadata: { chunkId, documentId, similarity, source, ... }
```

### Search Modes

#### Semantic (Vector) Search

```typescript
const semanticRetriever = createSemanticRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'docs',
  userId: 'user-123',
  threshold: 0.8,
});

const docs = await semanticRetriever.semanticSearch(
  'authentication flow',
  { topK: 10 }
);
```

#### Hybrid Search

```typescript
const hybridRetriever = createHybridRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'docs',
  userId: 'user-123',
});

const docs = await hybridRetriever.hybridSearch(
  'API authentication',
  { topK: 5 }
);
```

#### Keyword Search

```typescript
const docs = await retriever.keywordSearch(
  'Bearer token',
  { topK: 5 }
);
```

### Metadata Filtering

```typescript
const docs = await retriever.getRelevantDocumentsWithFilter(
  'How to deploy?',
  { category: 'deployment', version: 'v2' }
);
```

### Batch Retrieval

```typescript
const queries = [
  'How to authenticate?',
  'How to deploy?',
  'Rate limits?',
];

const results = await retriever.batch(queries);
// results[0] = docs for query 0, etc.
```

### Streaming

```typescript
for await (const doc of retriever.stream('API usage')) {
  console.log(doc.pageContent);
}
```

---

## SeizMemory

A LangChain-compatible chat memory backed by Seizn's Spring Memory API.

### Configuration

```typescript
interface SeizMemoryConfig {
  apiKey: string;           // Required: Seizn API key
  baseUrl?: string;         // Default: https://www.seizn.com/api
  namespace?: string;       // Default: 'default'
  userId?: string;          // User ID for user-scoped memory
  sessionId?: string;       // Session ID for session-scoped memory
  searchMode?: 'vector' | 'keyword' | 'hybrid';
  k?: number;               // Number of memories to retrieve (default: 5)
  threshold?: number;       // Similarity threshold (default: 0.7)
  inputKey?: string;        // Default: 'input'
  outputKey?: string;       // Default: 'output'
  humanPrefix?: string;     // Default: 'Human'
  aiPrefix?: string;        // Default: 'AI'
  returnMessages?: boolean; // Default: false
  timeout?: number;         // Default: 30000ms
}
```

### Basic Usage

```typescript
const memory = new SeizMemory({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',
  userId: 'user-123',
});

// Load memory variables (includes relevant memories)
const vars = await memory.loadMemoryVariables({
  input: 'Tell me about my preferences',
});

console.log(vars.history);   // Chat history
console.log(vars.memories);  // Relevant memories

// Save context after a turn
await memory.saveContext(
  { input: 'I prefer dark mode' },
  { output: 'Got it! I\'ll remember your preference for dark mode.' }
);
```

### Session-Scoped Memory

```typescript
const sessionMemory = createSessionMemory({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',
  sessionId: 'session-456',
});

// Memories are scoped to this session
await sessionMemory.addMemory(
  'User is asking about API setup',
  { memoryType: 'conversation' }
);
```

### User-Scoped Memory (Persistent)

```typescript
const userMemory = createUserMemory({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',
  userId: 'user-123',
});

// Memories persist across sessions
await userMemory.addMemory(
  'User prefers concise responses',
  { memoryType: 'preference' }
);
```

### Direct Memory Operations

```typescript
// Add a memory
const memory = await seizMemory.addMemory(
  'Important: User is on the Pro plan',
  {
    memoryType: 'fact',
    tags: ['plan', 'billing'],
  }
);

// Search memories
const memories = await seizMemory.searchMemories(
  'user plan information',
  { k: 5, tags: ['billing'] }
);

// Delete memories
await seizMemory.deleteMemories([memory.id]);

// Clear all session memories
await seizMemory.clear();
```

### With ConversationChain

```typescript
import { ConversationChain } from 'langchain/chains';
import { ChatOpenAI } from '@langchain/openai';

const chain = new ConversationChain({
  llm: new ChatOpenAI({ modelName: 'gpt-4' }),
  memory: new SeizMemory({
    apiKey: process.env.SEIZN_API_KEY!,
    namespace: 'chatbot',
    userId: 'user-123',
    returnMessages: true,
  }),
});

const response = await chain.invoke({
  input: 'What were we discussing?',
});
```

---

## SeizCallbackHandler

A LangChain callback handler that sends execution traces to Seizn's Flight Recorder.

### Configuration

```typescript
interface SeizCallbackConfig {
  apiKey: string;           // Required: Seizn API key
  userId: string;           // Required: User ID for tracing
  baseUrl?: string;         // Default: https://www.seizn.com/api
  plan?: string;            // User's plan tier
  collectionId?: string;    // Collection ID if applicable
  verbose?: boolean;        // Enable detailed logging
  metadata?: Record<string, unknown>;  // Custom trace metadata
  onTraceComplete?: (trace: TraceResult) => void;
  onError?: (error: Error) => void;
}
```

### Basic Usage

```typescript
const handler = new SeizCallbackHandler({
  apiKey: process.env.SEIZN_API_KEY!,
  userId: 'user-123',
  plan: 'pro',
});

const chain = new RetrievalQAChain({
  // ... chain config
  callbacks: [handler],
});

await chain.invoke({ query: 'Hello' });

// Get trace result
const trace = handler.getTraceResult();
console.log(`Trace ID: ${trace.traceId}`);
console.log(`Duration: ${trace.totalDurationMs}ms`);
console.log(`Tokens: ${trace.tokenUsage?.totalTokens}`);
```

### With Completion Callback

```typescript
const handler = new SeizCallbackHandler({
  apiKey: process.env.SEIZN_API_KEY!,
  userId: 'user-123',
  onTraceComplete: (trace) => {
    console.log(`Trace completed: ${trace.traceId}`);
    console.log(`Total duration: ${trace.totalDurationMs}ms`);
    console.log(`Estimated cost: $${trace.estimatedCost}`);

    if (trace.hasError) {
      console.error(`Error: ${trace.error}`);
    }
  },
  onError: (error) => {
    console.error('Execution error:', error);
  },
});
```

### Verbose Logging

```typescript
const handler = createVerboseCallbackHandler({
  apiKey: process.env.SEIZN_API_KEY!,
  userId: 'user-123',
});

// Will log all events to console
```

### Trace Result Structure

```typescript
interface TraceResult {
  traceId: string;
  requestId: string;
  totalDurationMs: number;
  spans: SpanData[];
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  estimatedCost?: number;
  hasError: boolean;
  error?: string;
}
```

### Supported Events

The callback handler captures:

| Event | Method |
|-------|--------|
| Chain Start/End/Error | `handleChainStart`, `handleChainEnd`, `handleChainError` |
| LLM Start/End/Error | `handleLLMStart`, `handleLLMEnd`, `handleLLMError` |
| Retriever Start/End/Error | `handleRetrieverStart`, `handleRetrieverEnd`, `handleRetrieverError` |
| Tool Start/End/Error | `handleToolStart`, `handleToolEnd`, `handleToolError` |
| Agent Action/End | `handleAgentAction`, `handleAgentEnd` |
| LLM New Token | `handleLLMNewToken` (streaming) |

---

## LangGraph Integration

The connector works seamlessly with LangGraph:

```typescript
import { StateGraph } from '@langchain/langgraph';
import { SeizRetriever, SeizCallbackHandler } from '@/lib/integrations/langchain';

// Create retriever
const retriever = new SeizRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'docs',
  userId: 'user-123',
});

// Create callback handler
const handler = new SeizCallbackHandler({
  apiKey: process.env.SEIZN_API_KEY!,
  userId: 'user-123',
});

// Define state
interface State {
  query: string;
  documents: Document[];
  answer: string;
}

// Create graph
const graph = new StateGraph<State>({
  channels: {
    query: { value: '' },
    documents: { value: [] },
    answer: { value: '' },
  },
});

// Add retrieval node
graph.addNode('retrieve', async (state) => {
  const docs = await retriever.getRelevantDocuments(state.query);
  return { documents: docs };
});

// Add generation node
graph.addNode('generate', async (state) => {
  // Generate answer from documents
  const answer = await generateAnswer(state.query, state.documents);
  return { answer };
});

// Connect nodes
graph.addEdge('retrieve', 'generate');
graph.setEntryPoint('retrieve');
graph.setFinishPoint('generate');

// Compile and run
const app = graph.compile();
const result = await app.invoke(
  { query: 'How to authenticate?' },
  { callbacks: [handler] }
);
```

---

## Advanced Patterns

### Combining Retriever with Memory

```typescript
import { RetrievalQAChain } from 'langchain/chains';

const retriever = new SeizRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'docs',
  userId: 'user-123',
});

const memory = new SeizMemory({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'qa-bot',
  userId: 'user-123',
  sessionId: 'session-123',
});

const chain = RetrievalQAChain.fromLLM(llm, retriever, {
  memory,
  returnSourceDocuments: true,
});
```

### Multi-Collection Retrieval

```typescript
const retrieverA = new SeizRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'product-docs',
  userId: 'user-123',
});

const retrieverB = new SeizRetriever({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'support-tickets',
  userId: 'user-123',
});

// Use with EnsembleRetriever or custom logic
const docsA = await retrieverA.getRelevantDocuments(query);
const docsB = await retrieverB.getRelevantDocuments(query);
const combinedDocs = [...docsA, ...docsB];
```

### Custom Metadata

```typescript
const handler = new SeizCallbackHandler({
  apiKey: process.env.SEIZN_API_KEY!,
  userId: 'user-123',
  metadata: {
    environment: 'production',
    version: '1.2.0',
    feature: 'chat-assistant',
  },
});
```

---

## Error Handling

All components throw `SeizError` on failure:

```typescript
interface SeizError {
  code: string;
  message: string;
  status?: number;
  details?: Record<string, unknown>;
}

// Usage
try {
  const docs = await retriever.getRelevantDocuments(query);
} catch (error) {
  if ((error as SeizError).code === 'TIMEOUT') {
    // Handle timeout
  } else if ((error as SeizError).status === 429) {
    // Handle rate limit
  }
}
```

---

## Best Practices

1. **Use hybrid search** for best recall and precision
2. **Enable reranking** for improved relevance ordering
3. **Set appropriate thresholds** to filter low-quality results
4. **Use session memory** for conversation context
5. **Use user memory** for persistent preferences
6. **Enable callbacks** for observability and debugging
7. **Handle errors gracefully** with retry logic

---

## API Reference

For detailed API documentation, see:
- [Summer RAG API](/docs/summer-sdk-quickstart.md)
- [Spring Memory API](/docs/spring-sdk-quickstart.md)
- [Flight Recorder](/docs/fall-flight-recorder.md)
