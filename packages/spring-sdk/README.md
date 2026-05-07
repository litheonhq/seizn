# @seizn/spring

Semantic Memory SDK for AI Applications. Store, search, and retrieve memories with automatic embedding and vector similarity search.

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

const spring = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
  namespace: 'my-app',
});

// Store a memory
await spring.remember('User prefers dark mode');

// Search memories
const memories = await spring.recall('UI preferences');
console.log(memories);
```

## Features

- **Semantic Search**: Vector-based similarity search with automatic embedding
- **Hybrid Search**: Combine vector and keyword search for better results
- **Memory Types**: Organize memories by type (fact, preference, experience, etc.)
- **Namespaces**: Isolate memories by namespace for multi-tenant apps
- **Bulk Operations**: Add multiple memories in a single request
- **Export/Import**: Backup and restore memories

## API Reference

### Configuration

```typescript
const spring = new SpringClient({
  apiKey: 'szn_...',           // Required: Your Seizn API key
  namespace: 'default',        // Optional: Default namespace
  baseUrl: 'https://seizn.com/api',  // Optional: API base URL
  timeout: 30000,              // Optional: Request timeout (ms)
  retries: 3,                  // Optional: Max retry attempts
  onError: (error) => {},      // Optional: Error callback
});
```

### Core Methods

#### `add(request)` - Add a memory

```typescript
const memory = await spring.add({
  content: 'User prefers dark mode',
  memory_type: 'preference',   // fact | preference | experience | relationship | instruction | conversation
  tags: ['ui', 'settings'],
  namespace: 'my-app',
});
```

#### `search(query)` - Search memories

```typescript
// Simple search
const results = await spring.search('UI preferences');

// Advanced search
const results = await spring.search({
  query: 'UI preferences',
  limit: 10,
  threshold: 0.7,
  mode: 'hybrid',  // vector | hybrid | keyword
  tags: ['ui'],
});
```

#### `get(id)` - Get a memory by ID

```typescript
const memory = await spring.get('mem_123');
```

#### `update(id, request)` - Update a memory

```typescript
const memory = await spring.update('mem_123', {
  content: 'User prefers light mode',
  tags: ['ui', 'settings', 'updated'],
});
```

#### `delete(ids)` - Delete memories

```typescript
await spring.delete('mem_123');
// or delete multiple
await spring.delete(['mem_123', 'mem_456']);
```

### Shortcuts

```typescript
// remember = add with type 'fact'
await spring.remember('Important fact');

// recall = search and return results array
const memories = await spring.recall('query', 5);

// forget = delete
await spring.forget('mem_123');
```

### Bulk Operations

```typescript
const result = await spring.bulkAdd([
  { content: 'Memory 1', memory_type: 'fact' },
  { content: 'Memory 2', memory_type: 'preference' },
]);
console.log(`Added: ${result.added}, Failed: ${result.failed}`);
```

### Export/Import

```typescript
// Export all memories
const backup = await spring.export();

// Export specific namespace
const backup = await spring.export({ namespace: 'my-app' });

// Import memories
const result = await spring.import(backup);
console.log(`Imported: ${result.imported}, Skipped: ${result.skipped}`);
```

### Analytics

```typescript
const stats = await spring.stats();
console.log(`Total memories: ${stats.totalMemories}`);
console.log(`Storage used: ${stats.storageUsedMb} MB`);
```

## Error Handling

```typescript
import { SpringClient, SpringError } from '@seizn/spring';

const spring = new SpringClient({
  apiKey: 'szn_...',
  onError: (error: SpringError) => {
    console.error(`Error [${error.code}]: ${error.message}`);
  },
});

try {
  await spring.search('query');
} catch (error) {
  if ((error as SpringError).code === 'RATE_LIMITED') {
    // Handle rate limiting
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  Memory,
  MemoryType,
  MemoryScope,
  SearchMode,
  SpringClientConfig,
  SpringError,
} from '@seizn/spring';
```

## License

MIT - see [LICENSE](LICENSE) for details.

## Links

- [Documentation](https://docs.seizn.com/spring)
- [API Reference](https://docs.seizn.com/api-reference)
- [GitHub](https://github.com/litheonhq/seizn)
