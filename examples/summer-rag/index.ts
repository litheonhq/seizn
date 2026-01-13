/**
 * Seizn Summer SDK - RAG Pipeline Example
 *
 * This example demonstrates how to build a production-ready
 * RAG (Retrieval-Augmented Generation) pipeline with Seizn Summer.
 *
 * Features:
 * - Document indexing with chunking
 * - Hybrid search (semantic + keyword)
 * - Reranking for improved relevance
 * - Full trace visibility
 *
 * Get your API key at: https://seizn.com/dashboard/keys
 */

import { SeizSummer } from "@seizn/summer";

// Initialize the client
const summer = new SeizSummer({
  apiKey: process.env.SEIZN_API_KEY!,
});

// Sample documents to index
const documents = [
  {
    id: "doc-1",
    content: `
# Introduction to RAG

Retrieval-Augmented Generation (RAG) is a technique that enhances
Large Language Models by providing them with relevant context from
external knowledge bases. This approach combines the benefits of
retrieval systems with the generative capabilities of LLMs.

## Key Benefits
- Reduced hallucinations
- Up-to-date information
- Domain-specific knowledge
- Traceable sources
    `,
    metadata: {
      source: "tech-docs",
      category: "ai",
      author: "Seizn Team",
    },
  },
  {
    id: "doc-2",
    content: `
# Vector Databases

Vector databases are specialized databases optimized for storing
and querying high-dimensional vectors. They are essential for
semantic search and RAG applications.

## Popular Options
- Pinecone: Managed, scalable
- Weaviate: Open source, feature-rich
- Qdrant: High performance, Rust-based
- Seizn: Debug-first, full tracing

## Seizn Advantages
- Full pipeline visibility
- Cost tracking per query
- Rerank delta visualization
- One-click trace sharing
    `,
    metadata: {
      source: "tech-docs",
      category: "databases",
      author: "Seizn Team",
    },
  },
  {
    id: "doc-3",
    content: `
# Reranking Explained

Reranking is a two-stage retrieval process where initial results
are re-scored using a more powerful model. This improves relevance
without the cost of running the expensive model on all documents.

## How It Works
1. Initial retrieval: Fast vector search returns top-k candidates
2. Reranking: Cross-encoder scores query-document pairs
3. Final ranking: Results sorted by rerank scores

## When to Use Reranking
- High-stakes queries (customer support, legal)
- Long documents where chunks may miss context
- Mixed-language or technical content
    `,
    metadata: {
      source: "tech-docs",
      category: "search",
      author: "Seizn Team",
    },
  },
];

async function main() {
  console.log("☀️ Seizn Summer SDK - RAG Example\n");

  // 1. Index documents
  console.log("1. Indexing documents...");

  for (const doc of documents) {
    const result = await summer.index({
      documents: [
        {
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
        },
      ],
      collection: "tech-docs",
      chunkSize: 500,
      chunkOverlap: 50,
    });

    console.log(`  ✓ Indexed: ${doc.id} (${result.chunks_created} chunks)`);
  }

  // 2. Simple retrieval
  console.log("\n2. Simple retrieval...");

  const simpleResults = await summer.retrieve({
    query: "What is RAG and why use it?",
    collection: "tech-docs",
    limit: 3,
  });

  console.log(`  Found ${simpleResults.results.length} results:`);
  for (const result of simpleResults.results) {
    console.log(`  - [${result.score.toFixed(3)}] ${result.content.slice(0, 60)}...`);
  }

  // 3. Hybrid search with reranking
  console.log("\n3. Hybrid search with reranking...");

  const hybridResults = await summer.retrieve({
    query: "vector database comparison seizn vs pinecone",
    collection: "tech-docs",
    limit: 5,
    searchType: "hybrid",
    hybridAlpha: 0.7, // 70% semantic, 30% keyword
    rerank: true,
    rerankModel: "cohere-rerank-v3",
  });

  console.log(`  Results with reranking:`);
  for (const result of hybridResults.results) {
    const delta = result.rerank_delta ? ` (Δ${result.rerank_delta > 0 ? "+" : ""}${result.rerank_delta})` : "";
    console.log(`  - [${result.score.toFixed(3)}]${delta} ${result.content.slice(0, 50)}...`);
  }

  // 4. Full trace for debugging
  console.log("\n4. Query with full trace...");

  const tracedResults = await summer.retrieve({
    query: "How does reranking improve search?",
    collection: "tech-docs",
    limit: 3,
    rerank: true,
    includeTrace: true,
  });

  if (tracedResults.trace) {
    console.log("  Pipeline trace:");
    console.log(`    - Embedding: ${tracedResults.trace.embedding_ms}ms`);
    console.log(`    - Vector search: ${tracedResults.trace.search_ms}ms`);
    console.log(`    - Reranking: ${tracedResults.trace.rerank_ms}ms`);
    console.log(`    - Total: ${tracedResults.trace.total_ms}ms`);
    console.log(`    - Estimated cost: $${tracedResults.trace.cost_usd.toFixed(6)}`);
    console.log(`    - Trace ID: ${tracedResults.trace.trace_id}`);
  }

  // 5. Generate RAG response
  console.log("\n5. RAG response generation...");

  const ragResponse = await summer.query({
    query: "Explain the benefits of using Seizn over other vector databases",
    collection: "tech-docs",
    limit: 3,
    rerank: true,
    generateAnswer: true,
    answerModel: "gpt-4o-mini",
  });

  console.log("  Generated answer:");
  console.log(`  "${ragResponse.answer}"`);
  console.log(`\n  Sources: ${ragResponse.sources?.map((s) => s.id).join(", ")}`);

  console.log("\n✅ RAG pipeline example completed!");
}

main().catch(console.error);
