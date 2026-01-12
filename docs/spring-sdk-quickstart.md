# Seizn Spring SDK - Quickstart Guide

Spring is Seizn's memory layer for AI applications. It provides semantic memory storage and retrieval with automatic embedding and similarity search.

## Installation

```bash
npm install @seizn/spring
# or
yarn add @seizn/spring
# or
pnpm add @seizn/spring
```

## Quick Start

```typescript
import { SpringClient } from '@seizn/spring';

// Initialize the client
const spring = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',  // Optional: default namespace
});

// Add a memory
await spring.remember('User prefers dark mode');

// Search memories
const memories = await spring.recall('UI preferences');
console.log(memories);
```

## Core Operations

### Adding Memories

```typescript
// Simple: remember a fact
await spring.remember('User name is John');

// Full control
const memory = await spring.add({
  content: 'User prefers dark mode and compact layout',
  memory_type: 'preference',
  tags: ['ui', 'settings'],
  namespace: 'user-prefs',
});
```

### Memory Types

| Type | Description |
|------|-------------|
| `fact` | Objective facts (default) |
| `preference` | User preferences |
| `experience` | Events, experiences |
| `relationship` | Relationship information |
| `instruction` | Rules, instructions |
| `conversation` | Conversation context |

### Searching Memories

```typescript
// Simple search
const results = await spring.recall('favorite color');

// Advanced search
const results = await spring.search({
  query: 'user interface preferences',
  limit: 10,
  threshold: 0.7,
  mode: 'hybrid',  // 'vector' | 'hybrid' | 'keyword'
  tags: ['settings'],
});
```

### Search Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `vector` | Semantic similarity search | Natural language queries |
| `keyword` | Full-text keyword search | Exact term matching |
| `hybrid` | Combined vector + keyword | Best of both worlds |

### Updating Memories

```typescript
const updated = await spring.update(memory.id, {
  content: 'User prefers dark mode (updated)',
  importance: 8,
  tags: ['ui', 'settings', 'important'],
});
```

### Deleting Memories

```typescript
// Delete single
await spring.forget(memory.id);

// Delete multiple
await spring.delete([id1, id2, id3]);
```

## Namespaces

Namespaces help organize memories by context or application:

```typescript
// Set default namespace in config
const spring = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'project-alpha',
});

// Or specify per-operation
await spring.add({
  content: 'Important fact',
  namespace: 'project-beta',
});

await spring.search({
  query: 'facts',
  namespace: 'project-beta',
});
```

## Bulk Operations

```typescript
// Add multiple memories at once
const result = await spring.bulkAdd([
  { content: 'Fact 1', memory_type: 'fact' },
  { content: 'Fact 2', memory_type: 'fact' },
  { content: 'Preference 1', memory_type: 'preference' },
]);

console.log(`Added: ${result.added}, Failed: ${result.failed}`);
```

## Export/Import

```typescript
// Export memories
const exported = await spring.export({ namespace: 'my-app' });
console.log(`Exported ${exported.count} memories`);

// Import memories
const result = await spring.import(exported);
console.log(`Imported: ${result.imported}, Skipped: ${result.skipped}`);
```

## Error Handling

```typescript
import { SpringClient, SpringError } from '@seizn/spring';

const spring = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
  onError: (error: SpringError) => {
    console.error(`[Spring Error] ${error.code}: ${error.message}`);
    // Send to monitoring service
  },
});

try {
  await spring.add({ content: '' });
} catch (error) {
  const springError = error as SpringError;
  if (springError.code === 'VALIDATION_ERROR') {
    console.log('Invalid input:', springError.message);
  }
}
```

## Configuration Options

```typescript
const spring = new SpringClient({
  apiKey: 'szn_...',           // Required: Your API key
  baseUrl: 'https://...',      // Optional: Custom API endpoint
  namespace: 'default',        // Optional: Default namespace
  timeout: 30000,              // Optional: Request timeout (ms)
  retries: 3,                  // Optional: Retry count
  onError: (err) => {},        // Optional: Error callback
});
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  SpringClient,
  Memory,
  MemoryType,
  MemorySearchResult,
  AddMemoryRequest,
  SearchMemoriesRequest,
  SpringError,
} from '@seizn/spring';

const handleMemory = (memory: Memory) => {
  console.log(memory.content, memory.memoryType);
};
```

## Best Practices

### 1. Use Meaningful Namespaces

```typescript
// Good: Descriptive namespaces
'chat-history'
'user-preferences'
'project-alpha-docs'

// Avoid: Generic namespaces
'default'
'data'
```

### 2. Choose Appropriate Memory Types

```typescript
// Preferences: Store user choices
await spring.add({
  content: 'Prefers email notifications',
  memory_type: 'preference',
});

// Facts: Store objective information
await spring.add({
  content: 'Company was founded in 2020',
  memory_type: 'fact',
});

// Instructions: Store rules
await spring.add({
  content: 'Always respond in formal English',
  memory_type: 'instruction',
});
```

### 3. Use Tags for Filtering

```typescript
// Add with tags
await spring.add({
  content: 'API key expires on 2025-12-31',
  tags: ['credentials', 'api', 'expiration'],
});

// Search with tag filter
const creds = await spring.search({
  query: 'expiration',
  tags: ['credentials'],
});
```

### 4. Handle Errors Gracefully

```typescript
try {
  const memories = await spring.recall(query);
  return memories;
} catch (error) {
  // Log error but don't crash
  console.error('Memory search failed:', error);
  return []; // Return empty array as fallback
}
```

## API Reference

See the full [API Reference](./spring-api-reference.md) for detailed documentation.

## Support

- Documentation: https://docs.seizn.com/spring
- GitHub Issues: https://github.com/seizn/sdk/issues
- Discord: https://discord.gg/seizn
