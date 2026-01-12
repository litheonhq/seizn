# @seizn/summer

RAG Infrastructure SDK for AI Applications. Build production-ready retrieval-augmented generation systems with vector search, hybrid search, and answer generation.

## Installation

```bash
npm install @seizn/summer
# or
yarn add @seizn/summer
# or
pnpm add @seizn/summer
```

## Quick Start

```typescript
import { SummerClient } from '@seizn/summer';

const summer = new SummerClient({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Create a collection
const collection = await summer.createCollection({
  name: 'my-docs',
  description: 'My document collection',
});

// Index documents
await summer.index({
  collectionId: collection.id,
  content: 'Your document content here...',
  metadata: { source: 'my-app' },
});

// Search
const results = await summer.search({
  collectionId: collection.id,
  query: 'What is machine learning?',
  mode: 'hybrid',
  rerank: true,
});

// RAG query
const answer = await summer.ask(collection.id, 'Explain machine learning');
console.log(answer.answer);
```

## Features

- **Document Indexing**: Automatic chunking and embedding with configurable strategies
- **Hybrid Search**: Combine vector similarity and keyword search
- **Reranking**: Cross-encoder reranking for improved relevance
- **Federated Search**: Search across multiple collections and sources
- **RAG Query**: Generate answers with citations from your documents
- **Analytics**: Track search performance and usage

## API Reference

### Configuration

```typescript
const summer = new SummerClient({
  apiKey: 'szn_...',           // Required: Your Seizn API key
  baseUrl: 'https://seizn.com/api/summer',  // Optional: API base URL
  timeout: 60000,              // Optional: Request timeout (ms)
  retries: 3,                  // Optional: Max retry attempts
  onError: (error) => {},      // Optional: Error callback
});
```

### Collection Management

```typescript
// Create collection
const collection = await summer.createCollection({
  name: 'my-collection',
  description: 'Optional description',
  embeddingModel: 'voyage-3', // or 'voyage-3-lite'
});

// List collections
const collections = await summer.listCollections();

// Get collection
const collection = await summer.getCollection('col_123');

// Delete collection
await summer.deleteCollection('col_123');

// Get statistics
const stats = await summer.getCollectionStats('col_123');
```

### Document Indexing

```typescript
// Index single document
const result = await summer.index({
  collectionId: 'col_123',
  content: 'Document text...',
  title: 'Document Title',
  externalId: 'doc-001',
  metadata: { source: 'api', category: 'tech' },
  chunkingStrategy: 'semantic', // 'fixed' | 'semantic' | 'paragraph'
  chunkSize: 512,
  chunkOverlap: 50,
});

// Bulk index
const result = await summer.bulkIndex({
  collectionId: 'col_123',
  documents: [
    { content: 'Doc 1...', title: 'Title 1' },
    { content: 'Doc 2...', title: 'Title 2' },
  ],
});

// Get document
const doc = await summer.getDocument('doc_123');

// Delete document
await summer.deleteDocument('doc_123');
```

### Search

```typescript
// Full search options
const results = await summer.search({
  collectionId: 'col_123',
  query: 'machine learning applications',
  topK: 10,
  threshold: 0.7,
  mode: 'hybrid',      // 'vector' | 'keyword' | 'hybrid'
  rerank: true,
  rerankTopN: 5,
  filter: { category: 'tech' },
  includeMetadata: true,
});

// Quick search shorthand
const results = await summer.query('col_123', 'my query', {
  topK: 10,
  mode: 'hybrid',
  rerank: true,
});

// Access results
results.results.forEach((r) => {
  console.log(`${r.title}: ${r.similarity}`);
});

// Timings
console.log(`Search took ${results.timings.totalMs}ms`);
```

### Federated Search

```typescript
const results = await summer.federatedSearch({
  query: 'machine learning',
  sources: ['col_123', 'col_456'], // Optional: specific sources
  topK: 20,
  mode: 'hybrid',
  rerank: true,
  dedupe: true,
});

// Source statistics
results.sourceStats.forEach((s) => {
  console.log(`${s.sourceId}: ${s.resultsCount} results in ${s.latencyMs}ms`);
});
```

### RAG Query

```typescript
// Full RAG options
const answer = await summer.rag({
  collectionId: 'col_123',
  query: 'What is machine learning?',
  systemPrompt: 'You are a helpful assistant.',
  contextLimit: 8000,
  citationStyle: 'inline', // 'inline' | 'footnote' | 'none'
  model: 'claude-sonnet',  // 'claude-sonnet' | 'claude-haiku'
});

// Quick ask shorthand
const answer = await summer.ask('col_123', 'What is machine learning?');

// Access answer
console.log(answer.answer);

// Access citations
answer.citations.forEach((c) => {
  console.log(`[${c.id}] ${c.title}: ${c.relevance}`);
});

// Usage stats
console.log(`Tokens: ${answer.usage.totalTokens}`);
```

### Utilities

```typescript
// Generate embeddings
const embeddings = await summer.embed(['text 1', 'text 2']);

// Rerank results
const ranked = await summer.rerank('query', [
  { id: '1', text: 'Document 1' },
  { id: '2', text: 'Document 2' },
], 5);
```

### Analytics

```typescript
const analytics = await summer.getAnalytics('col_123', 'week');

console.log(`Total searches: ${analytics.totalSearches}`);
console.log(`Avg latency: ${analytics.averageLatencyMs}ms`);
console.log('Top queries:', analytics.topQueries);
```

## Error Handling

```typescript
import { SummerClient, SummerError } from '@seizn/summer';

const summer = new SummerClient({
  apiKey: 'szn_...',
  onError: (error: SummerError) => {
    console.error(`Error [${error.code}]: ${error.message}`);
  },
});

try {
  await summer.search({ collectionId: 'col_123', query: 'test' });
} catch (error) {
  const err = error as SummerError;
  if (err.code === 'RATE_LIMITED') {
    // Handle rate limiting
  } else if (err.code === 'NOT_FOUND') {
    // Collection doesn't exist
  }
}
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import type {
  Collection,
  Document,
  SearchRequest,
  SearchResponse,
  SearchResult,
  RAGQueryResponse,
  Citation,
  SummerClientConfig,
  SummerError,
} from '@seizn/summer';
```

## License

MIT - see [LICENSE](LICENSE) for details.

## Links

- [Documentation](https://docs.seizn.com/summer)
- [API Reference](https://docs.seizn.com/api-reference)
- [GitHub](https://github.com/iruhana/seizn)
