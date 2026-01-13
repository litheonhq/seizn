# Seizn Summer SDK - RAG Pipeline Example

Build production-ready RAG (Retrieval-Augmented Generation) pipelines with full traceability.

## Features Demonstrated

- **Document indexing** with automatic chunking
- **Hybrid search** (semantic + keyword)
- **Reranking** for improved relevance
- **Full trace visibility** for debugging
- **Answer generation** with source attribution

## Prerequisites

1. Node.js 18+
2. A Seizn API key from [seizn.com/dashboard/keys](https://seizn.com/dashboard/keys)

## Setup

```bash
npm install
export SEIZN_API_KEY=szn_your_api_key_here
```

## Run

```bash
# Full example
npm start

# Just index documents
npm run index

# Just query
npm run query
```

## Code Highlights

### Index Documents

```typescript
import { SeizSummer } from "@seizn/summer";

const summer = new SeizSummer({ apiKey: process.env.SEIZN_API_KEY! });

await summer.index({
  documents: [{ id: "doc-1", content: "...", metadata: {} }],
  collection: "my-docs",
  chunkSize: 500,
});
```

### Hybrid Search with Reranking

```typescript
const results = await summer.retrieve({
  query: "How does RAG work?",
  collection: "my-docs",
  searchType: "hybrid",
  hybridAlpha: 0.7, // 70% semantic, 30% keyword
  rerank: true,
  includeTrace: true, // Get full debugging info
});

// See exactly what happened
console.log(results.trace);
// { embedding_ms: 45, search_ms: 12, rerank_ms: 89, cost_usd: 0.00012 }
```

### Generate RAG Answer

```typescript
const response = await summer.query({
  query: "What are the benefits of RAG?",
  collection: "my-docs",
  rerank: true,
  generateAnswer: true,
  answerModel: "gpt-4o-mini",
});

console.log(response.answer);
console.log(response.sources); // Traceable sources
```

## Trace Sharing

Share traces with your team for debugging:

```typescript
// Get shareable link
const shareUrl = await summer.traces.share(results.trace.trace_id);
console.log(shareUrl); // https://seizn.com/trace/abc123
```

## Next Steps

- Explore [Spring SDK](../spring-basic) for semantic memory
- See [Next.js integration](../nextjs-integration) for full-stack apps
- Read [full documentation](https://seizn.com/docs)
