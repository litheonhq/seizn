# Seizn JavaScript/TypeScript SDK

AI Memory Infrastructure for Developers.

## Installation

```bash
npm install seizn
# or
yarn add seizn
# or
pnpm add seizn
```

## Quick Start

```typescript
import { Seizn } from 'seizn';

// Initialize client
const client = new Seizn({ apiKey: 'szn_your_api_key' });

// Add a memory
const memory = await client.add('User prefers dark mode and uses TypeScript', {
  memory_type: 'preference',
  tags: ['ui', 'tech'],
});

// Search memories
const results = await client.search('user preferences', { limit: 5 });
results.forEach((result) => {
  console.log(`${result.content} (similarity: ${result.similarity.toFixed(2)})`);
});

// Extract memories from conversation
const memories = await client.extract(`
User: I'm a software engineer at Google.
Assistant: What do you work on?
User: Machine learning infrastructure, mostly Python and TensorFlow.
`);

// Query with memory context (RAG)
const response = await client.query('What programming languages does the user know?');
console.log(response.response);
```

## Features

### Memory Operations

```typescript
// Add memory
const memory = await client.add('User lives in Seoul', { memory_type: 'fact' });

// Get memory
const mem = await client.get('memory-uuid');

// Update memory
await client.update('memory-uuid', { tags: ['location'], importance: 8 });

// Delete memory
await client.delete('memory-uuid');

// Search with different modes
const vector = await client.search('query', { mode: 'vector' }); // Semantic search
const keyword = await client.search('query', { mode: 'keyword' }); // BM25 search
const hybrid = await client.search('query', { mode: 'hybrid' }); // Combined
```

### AI Operations

```typescript
// Extract memories from conversation
const extracted = await client.extract(conversationText, {
  model: 'haiku',
  auto_store: true,
});

// RAG query
const response = await client.query('What do you know about me?', {
  top_k: 5,
  model: 'haiku',
});
console.log(response.response);
console.log(response.memories_used);

// Summarize conversation
const summary = await client.summarize(
  [
    { role: 'user', content: 'Hello!' },
    { role: 'assistant', content: 'Hi there!' },
  ],
  { save_memories: true }
);
console.log(summary.text);
console.log(summary.key_points);
```

### Webhooks

```typescript
// Create webhook
const webhook = await client.createWebhook('My Webhook', 'https://example.com/webhook', {
  events: ['memory.created', 'memory.deleted'],
});
console.log(`Secret: ${webhook.secret}`); // Save this!

// List webhooks
const webhooks = await client.listWebhooks();

// Delete webhook
await client.deleteWebhook('webhook-uuid');
```

## Error Handling

```typescript
import { Seizn, SeiznError } from 'seizn';

const client = new Seizn({ apiKey: 'szn_...' });

try {
  const memory = await client.get('invalid-uuid');
} catch (error) {
  if (error instanceof SeiznError) {
    console.log(`Error: ${error.message}`);
    console.log(`Status: ${error.status}`);
  }
}
```

## Configuration

```typescript
const client = new Seizn({
  apiKey: 'szn_...',
  baseUrl: 'https://www.seizn.com', // Custom endpoint
  timeout: 30000, // Request timeout in ms
});
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  Memory,
  MemoryType,
  SearchResult,
  ExtractedMemory,
  QueryResponse,
  ConversationSummary,
  Webhook,
} from 'seizn';
```

## Models Used

- **Embedding**: Voyage-3 (1024 dimensions)
- **Extraction/Query**: Claude 3.5 Haiku or Claude Sonnet 4

## Browser & Node.js Support

Works in both browser and Node.js environments (Node.js 18+).

## Links

- [Documentation](https://docs.seizn.dev)
- [API Reference](https://docs.seizn.dev/api)
- [Dashboard](https://seizn.dev/dashboard)
