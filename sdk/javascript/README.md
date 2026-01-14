# Seizn JavaScript/TypeScript SDK

Official SDK for [Seizn](https://seizn.com) - AI Memory Infrastructure.

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
import Seizn from 'seizn';

// Initialize the client
const client = new Seizn({
  apiKey: 'your_api_key', // or set SEIZN_API_KEY env var
});

// Store a memory
const memory = await client.add('User prefers dark mode', {
  memory_type: 'preference',
  tags: ['ui', 'settings'],
});

// Search memories
const results = await client.search('user preferences', {
  limit: 5,
  threshold: 0.7,
});

// Extract memories from conversation
const extracted = await client.extract(
  'User: I love Python programming!\nAssistant: Great choice!',
  { model: 'haiku', auto_store: true }
);

// Query with RAG (memory-augmented response)
const response = await client.query('What are my preferences?', {
  model: 'sonnet',
  include_memories: true,
});
console.log(response.response);
```

## API Reference

### Constructor

```typescript
new Seizn({
  apiKey: string;      // Required (or SEIZN_API_KEY env)
  baseUrl?: string;    // Default: 'https://seizn.com'
  timeout?: number;    // Default: 30000ms
})
```

### Methods

#### `add(content, options?)`
Store a new memory.

```typescript
await client.add('User lives in Seoul', {
  memory_type: 'fact',        // 'fact' | 'preference' | 'experience' | 'relationship' | 'instruction'
  tags: ['location'],
  namespace: 'user_123',
  scope: 'user',              // 'user' | 'session' | 'agent'
});
```

#### `search(query, options?)`
Search memories by semantic similarity.

```typescript
const results = await client.search('location', {
  limit: 10,
  threshold: 0.7,
  namespace: 'user_123',
});
```

#### `delete(ids)`
Delete memories by ID.

```typescript
await client.delete(['mem_abc123', 'mem_def456']);
```

#### `extract(conversation, options?)`
Extract memories from conversation text.

```typescript
const result = await client.extract(conversationText, {
  model: 'haiku',       // 'haiku' (fast) | 'sonnet' (accurate)
  auto_store: true,
  namespace: 'user_123',
});
```

#### `query(query, options?)`
Get AI response using memories as context (RAG).

```typescript
const result = await client.query('What do I like?', {
  model: 'sonnet',
  top_k: 5,
  namespace: 'user_123',
  include_memories: true,
});
```

## Error Handling

```typescript
import Seizn, { AuthenticationError, RateLimitError, SeiznError } from 'seizn';

try {
  await client.add('...');
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('Invalid API key');
  } else if (error instanceof RateLimitError) {
    console.error('Rate limit exceeded, retry later');
  } else if (error instanceof SeiznError) {
    console.error(`Error: ${error.message} (${error.statusCode})`);
  }
}
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SEIZN_API_KEY` | Your Seizn API key |
| `SEIZN_BASE_URL` | Custom API base URL |

## TypeScript

Full TypeScript support with exported types:

```typescript
import type {
  SeiznConfig,
  Memory,
  AddMemoryOptions,
  SearchOptions,
  ExtractOptions,
  ExtractResult,
  QueryOptions,
  QueryResult,
} from 'seizn';
```

## Links

- [Documentation](https://seizn.com/docs)
- [API Reference](https://seizn.com/docs/api-reference)
- [Dashboard](https://seizn.com/dashboard)
- [GitHub](https://github.com/seizn/seizn-js)

## License

MIT
