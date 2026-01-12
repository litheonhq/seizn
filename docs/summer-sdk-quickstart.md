# Seizn Summer SDK - Quickstart Guide

Summer is Seizn's RAG (Retrieval-Augmented Generation) infrastructure. This SDK enables external applications to integrate vector search and RAG capabilities.

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

// Initialize the client
const summer = new SummerClient({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Create a collection
const collection = await summer.createCollection({
  name: 'research-papers',
  description: 'Academic research papers',
});

// Index documents
await summer.index({
  collectionId: collection.id,
  content: 'Machine learning is a subset of artificial intelligence...',
  title: 'Introduction to ML',
  metadata: { source: 'arxiv', year: 2024 },
});

// Search
const results = await summer.search({
  collectionId: collection.id,
  query: 'What is machine learning?',
  mode: 'hybrid',
  rerank: true,
});

// RAG Query
const answer = await summer.ask(
  collection.id,
  'Explain the basics of machine learning'
);
console.log(answer.answer);
console.log('Citations:', answer.citations);
```

## TheLabForge Integration Example

```typescript
// src/lib/seizn/summer-client.ts
import { SummerClient } from '@seizn/summer';

export const summerClient = new SummerClient({
  apiKey: process.env.SEIZN_API_KEY!,
  timeout: 60000,
  onError: (error) => {
    console.error('[Summer Error]', error.code, error.message);
    // Send to error tracking
  },
});

// src/lib/rag/enhanced-search.ts
import { summerClient } from '../seizn/summer-client';

export async function enhancedSearch(query: string) {
  // Use Seizn Summer for hybrid search with reranking
  const results = await summerClient.search({
    collectionId: process.env.SEIZN_COLLECTION_ID!,
    query,
    mode: 'hybrid',
    topK: 20,
    rerank: true,
    rerankTopN: 10,
    threshold: 0.5,
  });

  return results.results.map(r => ({
    id: r.documentId,
    content: r.content,
    score: r.rerankScore ?? r.similarity,
    metadata: r.metadata,
  }));
}

// src/app/api/ai/advisor/route.ts
import { summerClient } from '@/lib/seizn/summer-client';

export async function POST(req: Request) {
  const { question, collectionId } = await req.json();

  const response = await summerClient.rag({
    collectionId,
    query: question,
    systemPrompt: `You are a research advisor helping with grant proposals.
    Answer based on the provided context. Cite sources using [1], [2], etc.`,
    contextLimit: 8000,
    citationStyle: 'inline',
    model: 'claude-sonnet',
  });

  return Response.json({
    answer: response.answer,
    citations: response.citations,
    usage: response.usage,
  });
}
```

## Document Indexing

### Single Document

```typescript
await summer.index({
  collectionId: 'my-collection',
  externalId: 'doc-123', // Your ID for reference
  title: 'Document Title',
  content: 'Full document content...',
  metadata: {
    author: 'Jane Doe',
    year: 2024,
    category: 'research',
    tags: ['ML', 'AI'],
  },
  chunkingStrategy: 'semantic', // 'fixed' | 'semantic' | 'paragraph'
  chunkSize: 512,
  chunkOverlap: 50,
});
```

### Bulk Indexing

```typescript
const result = await summer.bulkIndex({
  collectionId: 'my-collection',
  documents: [
    { content: 'Doc 1...', title: 'First Document', metadata: { year: 2024 } },
    { content: 'Doc 2...', title: 'Second Document', metadata: { year: 2023 } },
    // ... more documents
  ],
  chunkingStrategy: 'semantic',
});

console.log(`Indexed: ${result.indexed}, Failed: ${result.failed}`);
```

## Search Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `vector` | Semantic similarity search | Natural language queries |
| `keyword` | Full-text keyword search | Exact term matching |
| `hybrid` | Combined vector + keyword | Best of both (recommended) |

### Search with Reranking

```typescript
const results = await summer.search({
  collectionId: 'my-collection',
  query: 'machine learning applications in healthcare',
  mode: 'hybrid',
  topK: 50,           // Initial candidates
  rerank: true,       // Enable Voyage Rerank
  rerankTopN: 10,     // Final results after reranking
  threshold: 0.5,     // Minimum similarity
  filter: {           // Metadata filter
    year: { $gte: 2022 },
    category: 'research',
  },
  includeMetadata: true,
});
```

## RAG Query

### Basic RAG

```typescript
const response = await summer.ask(
  'my-collection',
  'What are the latest trends in deep learning?'
);

console.log(response.answer);
console.log('Citations:', response.citations);
console.log('Tokens used:', response.usage.totalTokens);
```

### Advanced RAG

```typescript
const response = await summer.rag({
  collectionId: 'my-collection',
  query: 'Compare supervised and unsupervised learning',
  systemPrompt: `You are a research assistant.
    - Answer based only on provided context
    - Use academic language
    - Cite sources with [1], [2] format
    - If unsure, say "Based on the available literature..."`,
  contextLimit: 12000,
  citationStyle: 'inline',
  model: 'claude-sonnet',
});
```

## Federated Search

Search across multiple sources simultaneously:

```typescript
const results = await summer.federatedSearch({
  query: 'cancer immunotherapy recent advances',
  sources: ['nih-grants', 'nsf-awards', 'research-papers'],
  topK: 20,
  mode: 'hybrid',
  rerank: true,
  dedupe: true,
});

// Results include source information
results.results.forEach(r => {
  console.log(`[${r.source}] ${r.content.slice(0, 100)}...`);
});

// Per-source statistics
results.sourceStats.forEach(s => {
  console.log(`${s.sourceId}: ${s.resultsCount} results, ${s.latencyMs}ms`);
});
```

## Utilities

### Generate Embeddings

```typescript
// Single text
const [embedding] = await summer.embed('Hello world');
console.log('Dimensions:', embedding.length); // 1024

// Batch
const embeddings = await summer.embed([
  'First document',
  'Second document',
  'Third document',
]);
```

### Rerank Results

```typescript
const reranked = await summer.rerank(
  'machine learning',
  [
    { id: '1', text: 'Deep learning is a subset of machine learning...' },
    { id: '2', text: 'Weather forecasting uses statistical models...' },
    { id: '3', text: 'Neural networks power modern ML systems...' },
  ],
  2 // Top N
);

// Results sorted by relevance
console.log(reranked); // [{ id: '1', score: 0.95 }, { id: '3', score: 0.82 }]
```

## Analytics

```typescript
const stats = await summer.getCollectionStats('my-collection');
console.log(`Documents: ${stats.documentCount}`);
console.log(`Chunks: ${stats.chunkCount}`);
console.log(`Storage: ${stats.storageBytes / 1024 / 1024}MB`);

const analytics = await summer.getAnalytics('my-collection', 'week');
console.log(`Total searches: ${analytics.totalSearches}`);
console.log(`Avg latency: ${analytics.averageLatencyMs}ms`);
console.log('Top queries:', analytics.topQueries);
```

## Error Handling

```typescript
import { SummerClient, SummerError } from '@seizn/summer';

const summer = new SummerClient({
  apiKey: process.env.SEIZN_API_KEY!,
  onError: (error: SummerError) => {
    console.error(`[Summer Error] ${error.code}: ${error.message}`);
    // Send to monitoring
  },
});

try {
  const results = await summer.search({
    collectionId: 'invalid-id',
    query: 'test',
  });
} catch (error) {
  const summerError = error as SummerError;

  switch (summerError.code) {
    case 'COLLECTION_NOT_FOUND':
      console.log('Collection does not exist');
      break;
    case 'RATE_LIMITED':
      console.log('Too many requests, please retry later');
      break;
    case 'TIMEOUT':
      console.log('Request timed out');
      break;
    default:
      console.log('Unknown error:', summerError.message);
  }
}
```

## Configuration Options

```typescript
const summer = new SummerClient({
  apiKey: 'szn_...',                    // Required: API key
  baseUrl: 'https://...',               // Optional: Custom endpoint
  timeout: 60000,                       // Optional: Request timeout (ms)
  retries: 3,                           // Optional: Retry count
  onError: (err) => {},                 // Optional: Error callback
});
```

## TypeScript Support

Full TypeScript support with exported types:

```typescript
import {
  SummerClient,
  Collection,
  Document,
  SearchRequest,
  SearchResponse,
  SearchResult,
  RAGQueryRequest,
  RAGQueryResponse,
  SummerError,
} from '@seizn/summer';
```

## Best Practices

### 1. Use Hybrid Search with Reranking

```typescript
// Best quality for most use cases
const results = await summer.search({
  collectionId,
  query,
  mode: 'hybrid',      // Combines semantic + keyword
  rerank: true,        // Quality boost
  topK: 30,            // More candidates
  rerankTopN: 10,      // Best results
});
```

### 2. Chunk Documents Properly

```typescript
// For research papers: semantic chunking
await summer.index({
  collectionId,
  content: paper.abstract + paper.body,
  chunkingStrategy: 'semantic',
  chunkSize: 512,
  chunkOverlap: 50,
});

// For structured documents: paragraph chunking
await summer.index({
  collectionId,
  content: proposal.content,
  chunkingStrategy: 'paragraph',
});
```

### 3. Use Metadata for Filtering

```typescript
// Index with rich metadata
await summer.index({
  collectionId,
  content: paper.content,
  metadata: {
    year: paper.year,
    field: paper.field,
    citations: paper.citationCount,
    journal: paper.journal,
  },
});

// Filter in search
const results = await summer.search({
  collectionId,
  query,
  filter: {
    year: { $gte: 2020 },
    field: 'machine learning',
    citations: { $gt: 50 },
  },
});
```

### 4. Handle Errors Gracefully

```typescript
async function safeSearch(query: string) {
  try {
    return await summer.search({
      collectionId: 'my-collection',
      query,
      mode: 'hybrid',
    });
  } catch (error) {
    console.error('Search failed:', error);
    // Fallback to empty results
    return { results: [], count: 0, mode: 'hybrid' as const, timings: {} };
  }
}
```

## Support

- Documentation: https://docs.seizn.com/summer
- GitHub Issues: https://github.com/seizn/sdk/issues
- Discord: https://discord.gg/seizn
