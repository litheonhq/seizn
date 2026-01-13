# Seizn Spring SDK - Basic Example

This example demonstrates how to use the Seizn Spring SDK for semantic memory storage and retrieval.

## Prerequisites

1. Node.js 18+
2. A Seizn API key from [seizn.com/dashboard/keys](https://seizn.com/dashboard/keys)

## Setup

```bash
# Install dependencies
npm install

# Set your API key
export SEIZN_API_KEY=szn_your_api_key_here
```

## Run

```bash
npm start
```

## What This Example Does

1. **Store memories** - Creates semantic memories with different types (preference, fact, experience)
2. **Query memories** - Performs semantic search to find relevant memories
3. **List memories** - Retrieves memories filtered by type
4. **Trace debugging** - Shows latency breakdown for debugging

## Code Highlights

```typescript
import { SeizSpring } from "@seizn/spring";

const spring = new SeizSpring({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Store a memory
await spring.memories.create({
  content: "User prefers dark mode",
  type: "preference",
});

// Query semantically
const results = await spring.memories.query({
  query: "What are the user's preferences?",
  limit: 5,
});
```

## Next Steps

- Check out the [Summer SDK example](../summer-rag) for RAG pipelines
- See [Next.js integration](../nextjs-integration) for full-stack apps
- Read the [full documentation](https://seizn.com/docs)
