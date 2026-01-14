# @seizn/vercel-ai

Official Vercel AI SDK adapter for Seizn AI Infrastructure. Provides tools, middleware, and providers for building RAG-enabled AI applications.

## Installation

```bash
npm install @seizn/vercel-ai ai zod
# or
pnpm add @seizn/vercel-ai ai zod
# or
yarn add @seizn/vercel-ai ai zod
```

## Features

- **Tools**: Ready-to-use AI SDK tools for retrieval operations
- **Middleware**: Automatic tracing, metrics, and RAG injection
- **Provider**: Custom RAG-enabled model provider
- **Traceability**: Built-in tracing and cryptographic receipts
- **Citations**: Automatic source attribution

## Quick Start

### Using Tools

The simplest way to add RAG capabilities to your AI application:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createSeiznRetrievalTool } from '@seizn/vercel-ai';

const seiznRetrieval = createSeiznRetrievalTool({
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'my-docs',
});

const result = await generateText({
  model: openai('gpt-4o'),
  tools: { seiznRetrieval },
  maxSteps: 3,
  prompt: 'What is the return policy?',
});

console.log(result.text);
```

### Using Middleware

Add observability and automatic RAG to all LLM calls:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { seiznMiddleware } from '@seizn/vercel-ai';

const result = await generateText({
  model: openai('gpt-4o'),
  middleware: seiznMiddleware({
    apiKey: process.env.SEIZN_API_KEY!,
    enableTracing: true,
    enableAutoRAG: true,
    ragCollectionId: 'my-docs',
    onMetrics: (metrics) => {
      console.log(`Latency: ${metrics.totalLatencyMs}ms`);
    },
  }),
  prompt: 'What are the shipping options?',
});
```

### Using RAG Provider

For full control over the RAG pipeline:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createSeiznRAGProvider } from '@seizn/vercel-ai';

const seizn = createSeiznRAGProvider({
  apiKey: process.env.SEIZN_API_KEY!,
  baseModel: openai('gpt-4o'),
  defaultCollectionId: 'my-docs',
});

const result = await generateText({
  model: seizn.rag('my-docs'),
  prompt: 'How do I get started?',
});

// Access RAG metadata
const metadata = result.experimental_providerMetadata?.seizn;
console.log(`Used ${metadata.contextsCount} contexts`);
console.log(`Citations: ${metadata.citations.map(c => c.source).join(', ')}`);
```

## API Reference

### Tools

#### `createSeiznRetrievalTool(config)`

Creates a general-purpose retrieval tool.

```typescript
const tool = createSeiznRetrievalTool({
  apiKey: string;           // Required: Seizn API key
  collectionId?: string;    // Default collection ID
  baseUrl?: string;         // Custom API URL
  defaultTopK?: number;     // Default result count (default: 5)
  defaultMinScore?: number; // Minimum similarity threshold
  debug?: boolean;          // Enable debug logging
});
```

#### `createSeiznDocumentSearchTool(config)`

Creates a tool optimized for document search with formatted output.

#### `createSeiznMultiCollectionSearchTool(config)`

Creates a tool that searches across multiple collections.

#### `createSeiznQATool(config)`

Creates a simple Q&A tool with formatted context.

#### `createSeiznVerificationTool(config)`

Creates a tool for verifying claims against the knowledge base.

### Middleware

#### `seiznMiddleware(config)`

Full-featured middleware with tracing, metrics, and optional auto-RAG.

```typescript
const middleware = seiznMiddleware({
  apiKey: string;              // Required: Seizn API key
  enableTracing?: boolean;     // Enable distributed tracing (default: true)
  enableMetrics?: boolean;     // Enable metrics collection (default: true)
  enableAutoRAG?: boolean;     // Enable automatic RAG (default: false)
  ragCollectionId?: string;    // Collection for auto RAG
  ragTopK?: number;            // Number of RAG contexts (default: 5)
  traceMetadata?: object;      // Custom trace metadata
  onTrace?: (event) => void;   // Trace event callback
  onMetrics?: (metrics) => void; // Metrics callback
  debug?: boolean;             // Enable debug logging
});
```

#### `seiznTracingMiddleware(config)`

Lightweight middleware for tracing only.

#### `seiznRAGMiddleware(config)`

Convenience middleware for RAG with sensible defaults.

### Provider

#### `createSeiznRAGProvider(config)`

Creates a RAG-enabled model provider.

```typescript
const provider = createSeiznRAGProvider({
  apiKey: string;               // Required: Seizn API key
  baseModel: LanguageModelV1;   // Required: Base LLM model
  defaultCollectionId?: string; // Default collection
  defaultTopK?: number;         // Default context count
  defaultMinScore?: number;     // Default score threshold
  systemPromptTemplate?: (context: string) => string; // Custom prompt
  debug?: boolean;              // Enable debug logging
});

// Use the provider
const model = provider.rag('collection-id');
const model = provider.rag({ collectionId: 'docs', topK: 10 });
```

#### `wrapWithRAG(options)`

Convenience function to wrap a model with RAG capabilities.

```typescript
const ragModel = wrapWithRAG({
  baseModel: openai('gpt-4o'),
  apiKey: process.env.SEIZN_API_KEY!,
  collectionId: 'docs',
  topK: 5,
});
```

## Response Metadata

All Seizn operations include metadata for traceability:

```typescript
interface SeiznRAGMetadata {
  traceId: string;           // Unique trace ID
  ragTraceId: string;        // RAG retrieval trace ID
  contextsCount: number;     // Number of contexts used
  avgScore: number;          // Average relevance score
  ragLatencyMs: number;      // RAG retrieval latency
  totalLatencyMs: number;    // Total operation latency
  citations: Array<{         // Source citations
    index: number;
    source: string;
    url?: string;
  }>;
  receipt: {                 // Cryptographic receipt
    queryHash: string;
    resultHash: string;
    timestamp: string;
  };
}
```

## TypeScript Support

This package is written in TypeScript and includes full type definitions.

## Requirements

- Node.js >= 18.0.0
- Vercel AI SDK >= 3.0.0
- Zod >= 3.0.0

## License

MIT

## Links

- [Documentation](https://seizn.com/docs/sdk/vercel-ai)
- [GitHub](https://github.com/seizn/seizn-sdk)
- [Seizn Platform](https://seizn.com)
