/**
 * Seizn Spring SDK - Basic Example
 *
 * This example demonstrates how to use the Seizn Spring SDK
 * for semantic memory storage and retrieval.
 *
 * Get your API key at: https://seizn.com/dashboard/keys
 */

import { SeizSpring } from "@seizn/spring";

// Initialize the client
const spring = new SeizSpring({
  apiKey: process.env.SEIZN_API_KEY!,
  // Optional: specify base URL for self-hosted deployments
  // baseUrl: "https://your-seizn-instance.com/api",
});

async function main() {
  console.log("🌱 Seizn Spring SDK Example\n");

  // 1. Store memories
  console.log("1. Storing memories...");

  const memories = [
    {
      content: "User prefers dark mode for all applications",
      type: "preference" as const,
      metadata: { category: "ui", priority: "high" },
    },
    {
      content: "User's favorite programming language is TypeScript",
      type: "fact" as const,
      metadata: { category: "tech", verified: true },
    },
    {
      content: "Had a great meeting with the design team on Jan 10",
      type: "experience" as const,
      metadata: { date: "2025-01-10", participants: ["design-team"] },
    },
  ];

  for (const memory of memories) {
    const result = await spring.memories.create(memory);
    console.log(`  ✓ Stored: "${memory.content.slice(0, 40)}..." (ID: ${result.id})`);
  }

  // 2. Query memories semantically
  console.log("\n2. Querying memories...");

  const queryResult = await spring.memories.query({
    query: "What are the user's preferences?",
    limit: 5,
    threshold: 0.7,
  });

  console.log(`  Found ${queryResult.results.length} relevant memories:`);
  for (const result of queryResult.results) {
    console.log(`  - [${result.score.toFixed(2)}] ${result.content.slice(0, 50)}...`);
  }

  // 3. List all memories
  console.log("\n3. Listing memories...");

  const allMemories = await spring.memories.list({
    limit: 10,
    type: "preference",
  });

  console.log(`  Total preference memories: ${allMemories.memories.length}`);

  // 4. Get trace information (debugging)
  console.log("\n4. Query with trace...");

  const tracedQuery = await spring.memories.query({
    query: "programming languages",
    limit: 3,
    includeTrace: true,
  });

  if (tracedQuery.trace) {
    console.log("  Trace info:");
    console.log(`    - Embedding latency: ${tracedQuery.trace.embedding_ms}ms`);
    console.log(`    - Search latency: ${tracedQuery.trace.search_ms}ms`);
    console.log(`    - Total latency: ${tracedQuery.trace.total_ms}ms`);
  }

  console.log("\n✅ Example completed successfully!");
}

main().catch(console.error);
