# @seizn/core

Core SDK for Seizn AI Infrastructure - A1 Drop-in Adoption Layer.

## Installation

```bash
npm install @seizn/core
# or
yarn add @seizn/core
# or
pnpm add @seizn/core
```

## Quick Start

```typescript
import { SeiznClient } from '@seizn/core';

const client = new SeiznClient({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Retrieve relevant contexts for RAG
const result = await client.retrieve({
  query: 'What are the key findings?',
  topK: 5,
  rerank: true,
});

// Use contexts in your LLM prompt
const contexts = result.contexts.map(c => c.content).join('\n\n');
console.log('Retrieved contexts:', contexts);

// Access citations for attribution
const citations = result.citations;
console.log('Citations:', citations);

// Verify audit trail
console.log('Receipt:', result.receipt);
```

## Features

- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Retry Logic**: Automatic exponential backoff retry for transient failures
- **Tracing**: Built-in distributed tracing support (W3C Trace Context compatible)
- **Citations**: Automatic source attribution for retrieved content
- **Receipts**: Cryptographic audit trail for compliance

## Configuration

```typescript
import { SeiznClient } from '@seizn/core';

const client = new SeiznClient({
  // Required
  apiKey: 'szn_live_...',

  // Optional
  baseUrl: 'https://api.seizn.com',  // Custom API endpoint
  timeout: 30000,                     // Request timeout (ms)
  maxRetries: 3,                      // Max retry attempts
  debug: false,                       // Enable debug logging
  defaultCollectionId: 'docs',        // Default collection
  customHeaders: {                    // Additional headers
    'x-custom-header': 'value',
  },
});
```

## API Reference

### Retrieval

```typescript
// Basic retrieval
const result = await client.retrieve({
  query: 'search query',
});

// Advanced retrieval
const result = await client.retrieve({
  query: 'search query',
  collectionId: 'my-collection',
  topK: 10,
  filters: { category: 'docs' },
  rerank: true,
  includeMetadata: true,
  minScore: 0.5,
});

// Response structure
interface RetrievalResponse {
  contexts: Context[];      // Retrieved chunks
  receipt: Receipt;         // Audit trail
  traceId: string;          // Request trace ID
  citations: Citation[];    // Source citations
  latencyMs: number;        // Request latency
}
```

### Collections

```typescript
// List collections
const collections = await client.listCollections();

// Get collection
const collection = await client.getCollection('collection-id');

// Create collection
const newCollection = await client.createCollection('My Docs', {
  description: 'Documentation collection',
});

// Delete collection
await client.deleteCollection('collection-id');
```

### Documents

```typescript
// Upload document
const result = await client.uploadDocument({
  collectionId: 'my-collection',
  content: 'Document content...',
  contentType: 'text/plain',
  filename: 'doc.txt',
  metadata: { author: 'John' },
});

// Delete document
await client.deleteDocument('document-id');
```

### Health Check

```typescript
// Check API health
const health = await client.health();

// Verify API key
const isValid = await client.verify();
```

## Error Handling

```typescript
import {
  SeiznClient,
  SeiznError,
  AuthenticationError,
  RateLimitError,
  isSeiznError,
} from '@seizn/core';

try {
  const result = await client.retrieve({ query: 'test' });
} catch (error) {
  if (isSeiznError(error)) {
    console.error('Error code:', error.code);
    console.error('Request ID:', error.requestId);

    if (error.isRetryable()) {
      // Handle retryable error
    }
  }
}
```

## Tracing

```typescript
import {
  createTraceContext,
  withTrace,
  traceManager,
} from '@seizn/core';

// Create trace context
const context = createTraceContext();

// Execute with tracing
const result = await withTrace('my-operation', async (ctx) => {
  // Your code here
  return await client.retrieve({ query: 'test' });
});

// Get trace headers for propagation
const headers = traceManager.getTraceHeaders();
```

## License

MIT
