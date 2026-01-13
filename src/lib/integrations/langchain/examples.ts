/**
 * Seizn LangChain Integration Examples
 *
 * This file contains example code demonstrating how to use Seizn's
 * LangChain integration components with the Flight Recorder.
 *
 * These examples are for documentation purposes and can be used
 * as a starting point for your own implementations.
 */

import {
  SeizRetriever,
  SeizMemory,
  SeizCallbackHandler,
  createFlightRecorderHandler,
  createSeizRetriever,
  createSeizVectorStore,
} from './index';

// ============================================
// Example 1: Basic Retrieval with Flight Recorder
// ============================================

/**
 * Basic retrieval example with Flight Recorder tracing.
 *
 * This example shows how to set up a retriever with automatic
 * tracing to the Flight Recorder for observability.
 */
export async function basicRetrievalExample() {
  // Create a retriever with tracing enabled
  const retriever = createSeizRetriever({
    apiKey: process.env.SEIZN_API_KEY!,
    collectionId: 'my-docs',
    userId: 'user-123',
    mode: 'hybrid',
    topK: 5,
    enableTracing: true, // Enable Flight Recorder tracing
  });

  // Perform a search
  const documents = await retriever.getRelevantDocuments(
    'How do I implement RAG with LangChain?'
  );

  console.log('Retrieved documents:', documents.length);
  for (const doc of documents) {
    console.log(`- ${doc.metadata.documentId}: ${doc.pageContent.slice(0, 100)}...`);
  }

  return documents;
}

// ============================================
// Example 2: RAG Chain with Flight Recorder Handler
// ============================================

/**
 * RAG chain example with Flight Recorder callback handler.
 *
 * This demonstrates how to use the SeizFlightRecorderHandler
 * to automatically trace LangChain operations.
 */
export async function ragChainWithTracingExample() {
  // Create the Flight Recorder handler
  const handler = createFlightRecorderHandler({
    userId: 'user-123',
    plan: 'pro',
    collectionId: 'my-docs',
    verbose: true, // Enable debug logging
    onTraceComplete: (traceId, durationMs) => {
      console.log(`Trace completed: ${traceId} in ${durationMs}ms`);
    },
    onError: (error, runId) => {
      console.error(`Error in run ${runId}:`, error.message);
    },
  });

  // Create the retriever
  const retriever = new SeizRetriever({
    apiKey: process.env.SEIZN_API_KEY!,
    collectionId: 'my-docs',
    userId: 'user-123',
    mode: 'hybrid',
    topK: 5,
  });

  /*
   * In a full implementation, you would use this with LangChain:
   *
   * import { ChatOpenAI } from '@langchain/openai';
   * import { RetrievalQAChain } from 'langchain/chains';
   *
   * const llm = new ChatOpenAI({
   *   modelName: 'gpt-4-turbo',
   *   temperature: 0,
   * });
   *
   * const chain = RetrievalQAChain.fromLLM(llm, retriever, {
   *   callbacks: [handler],
   * });
   *
   * const result = await chain.invoke({
   *   query: 'What is RAG and how does it work?',
   * });
   *
   * // Get trace information
   * console.log('Trace ID:', handler.getTraceId());
   * console.log('Token usage:', handler.getTokenUsage());
   * console.log('Retrieved docs:', handler.getRetrievalResults());
   */

  // For demonstration, simulate a chain execution
  const query = 'What is RAG and how does it work?';

  // Simulate chain start
  await handler.handleChainStart(
    { name: 'RetrievalQAChain' },
    { query },
    'run-123'
  );

  // Simulate retriever
  await handler.handleRetrieverStart(
    { name: 'SeizRetriever' },
    query,
    'run-456',
    'run-123'
  );

  const docs = await retriever.getRelevantDocuments(query);

  await handler.handleRetrieverEnd(
    docs.map((d) => ({
      pageContent: d.pageContent,
      metadata: d.metadata,
    })),
    'run-456'
  );

  // Simulate LLM
  await handler.handleLLMStart(
    { name: 'gpt-4-turbo' },
    ['Generate answer based on context...'],
    'run-789',
    'run-123'
  );

  await handler.handleLLMEnd(
    {
      generations: [[{ text: 'RAG (Retrieval-Augmented Generation) is...' }]],
      llmOutput: {
        tokenUsage: {
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700,
        },
      },
    },
    'run-789'
  );

  // Complete the chain
  await handler.handleChainEnd(
    { output: 'RAG (Retrieval-Augmented Generation) is...' },
    'run-123'
  );

  // Get final trace info
  console.log('Final trace ID:', handler.getTraceId());
  console.log('Token usage:', handler.getTokenUsage());
  console.log('Retrieved documents:', handler.getRetrievalResults().length);

  return handler.getTraceId();
}

// ============================================
// Example 3: VectorStore with MMR Search
// ============================================

/**
 * VectorStore example with Maximum Marginal Relevance search.
 *
 * MMR search provides diverse results by balancing relevance
 * and diversity in the returned documents.
 */
export async function vectorStoreMMRExample() {
  // Create a vector store
  const vectorStore = createSeizVectorStore({
    apiKey: process.env.SEIZN_API_KEY!,
    collectionId: 'my-docs',
    userId: 'user-123',
    rerank: true,
    autopilot: true,
  });

  // Perform similarity search
  const similarDocs = await vectorStore.similaritySearch(
    'Machine learning best practices',
    5
  );
  console.log('Similarity search results:', similarDocs.length);

  // Perform MMR search for more diverse results
  const diverseDocs = await vectorStore.maxMarginalRelevanceSearch(
    'Machine learning best practices',
    5,
    {
      fetchK: 20, // Fetch more candidates for diversity
      lambda: 0.7, // Higher lambda = more relevance, less diversity
    }
  );
  console.log('MMR search results:', diverseDocs.length);

  // Perform hybrid search
  const hybridDocs = await vectorStore.hybridSearch(
    'Machine learning best practices',
    5
  );
  console.log('Hybrid search results:', hybridDocs.length);

  // Use as a retriever
  const retriever = vectorStore.asRetriever({
    k: 5,
    searchType: 'mmr',
    lambda: 0.7,
  });

  const retrieverDocs = await retriever.getRelevantDocuments(
    'Machine learning best practices'
  );
  console.log('Retriever results:', retrieverDocs.length);

  return {
    similarity: similarDocs,
    mmr: diverseDocs,
    hybrid: hybridDocs,
  };
}

// ============================================
// Example 4: Memory with Session Context
// ============================================

/**
 * Memory example with session-scoped context.
 *
 * This shows how to use SeizMemory for persistent
 * conversation history across sessions.
 */
export async function memoryWithSessionExample() {
  // Create session-scoped memory
  const memory = new SeizMemory({
    apiKey: process.env.SEIZN_API_KEY!,
    namespace: 'my-app',
    userId: 'user-123',
    sessionId: 'session-456',
    k: 5, // Number of memories to retrieve
    returnMessages: true, // Return as message objects
  });

  // Simulate a conversation
  const turns = [
    { input: 'What is RAG?', output: 'RAG stands for Retrieval-Augmented Generation...' },
    { input: 'How is it different from fine-tuning?', output: 'Unlike fine-tuning...' },
    { input: 'Which should I use for my project?', output: 'The choice depends on...' },
  ];

  for (const turn of turns) {
    // Load context (includes relevant memories)
    const context = await memory.loadMemoryVariables({ input: turn.input });
    console.log('Context for:', turn.input);
    console.log('History:', context.history);

    // Save the conversation turn
    await memory.saveContext(
      { input: turn.input },
      { output: turn.output }
    );
  }

  // Search for relevant memories
  const memories = await memory.searchMemories('RAG vs fine-tuning');
  console.log('Found memories:', memories.length);

  return memories;
}

// ============================================
// Example 5: API-based Callback Handler
// ============================================

/**
 * API-based callback handler example.
 *
 * This shows how to use SeizCallbackHandler which sends
 * traces via the Seizn API (for client-side usage).
 */
export async function apiCallbackHandlerExample() {
  // Create API-based callback handler
  const handler = new SeizCallbackHandler({
    apiKey: process.env.SEIZN_API_KEY!,
    userId: 'user-123',
    plan: 'pro',
    collectionId: 'my-docs',
    verbose: true,
    metadata: {
      environment: 'production',
      appVersion: '1.0.0',
    },
    onTraceComplete: (trace) => {
      console.log('Trace completed:', {
        traceId: trace.traceId,
        duration: trace.totalDurationMs,
        tokenUsage: trace.tokenUsage,
        cost: trace.estimatedCost,
      });
    },
    onError: (error) => {
      console.error('Trace error:', error.message);
    },
  });

  /*
   * Use with LangChain:
   *
   * const chain = new ConversationChain({
   *   llm: myLLM,
   *   callbacks: [handler],
   * });
   */

  // After execution, get trace result
  const traceResult = handler.getTraceResult();
  console.log('Trace result:', traceResult);

  // Reset for next request
  handler.reset();

  return traceResult;
}

// ============================================
// Example 6: Custom Events and Feedback
// ============================================

/**
 * Custom events and feedback example.
 *
 * Shows how to add custom events and user feedback
 * to traces for richer observability.
 */
export async function customEventsExample() {
  const handler = createFlightRecorderHandler({
    userId: 'user-123',
    plan: 'pro',
    verbose: true,
  });

  // Simulate a chain with custom events
  await handler.handleChainStart(
    { name: 'CustomChain' },
    { query: 'test query' },
    'run-001'
  );

  // Add custom events during execution
  handler.addCustomEvent('data_preprocessing', {
    inputSize: 1024,
    cleanedSize: 980,
    removedStopwords: 44,
  });

  handler.addCustomEvent('cache_check', {
    cacheHit: false,
    cacheKey: 'query-hash-123',
  });

  handler.addCustomEvent('model_selection', {
    selectedModel: 'gpt-4-turbo',
    reason: 'complex_query',
  });

  // Complete the chain
  await handler.handleChainEnd(
    { output: 'Generated response...' },
    'run-001'
  );

  // Add user feedback after completion
  handler.addFeedback({
    rating: 4,
    comment: 'Good response but could be more detailed',
    tags: ['helpful', 'needs-improvement'],
  });

  console.log('Custom events added to trace:', handler.getTraceId());

  return handler.getTraceId();
}

// ============================================
// Example 7: Batch Processing with Tracing
// ============================================

/**
 * Batch processing example with tracing.
 *
 * Shows how to process multiple queries efficiently
 * while maintaining tracing for each.
 */
export async function batchProcessingExample() {
  const retriever = new SeizRetriever({
    apiKey: process.env.SEIZN_API_KEY!,
    collectionId: 'my-docs',
    userId: 'user-123',
    mode: 'hybrid',
    topK: 3,
  });

  const queries = [
    'What is RAG?',
    'How to implement vector search?',
    'Best practices for LLM applications',
  ];

  // Batch retrieve
  const results = await retriever.batch(queries);

  console.log('Batch results:');
  for (let i = 0; i < queries.length; i++) {
    console.log(`Query: "${queries[i]}" -> ${results[i].length} documents`);
  }

  return results;
}

// ============================================
// Example 8: Streaming Results
// ============================================

/**
 * Streaming results example.
 *
 * Shows how to stream retrieval results for
 * progressive UI updates.
 */
export async function streamingExample() {
  const retriever = new SeizRetriever({
    apiKey: process.env.SEIZN_API_KEY!,
    collectionId: 'my-docs',
    userId: 'user-123',
    mode: 'vector',
    topK: 5,
  });

  console.log('Streaming documents:');

  // Stream documents one by one
  for await (const doc of retriever.stream('AI and machine learning')) {
    console.log(`- Received: ${doc.metadata.documentId}`);
    // Process each document as it arrives
    // (in practice, this would update UI progressively)
  }

  return true;
}

// ============================================
// Utility: Run All Examples
// ============================================

/**
 * Run all examples (for testing)
 */
export async function runAllExamples() {
  console.log('=== Running LangChain Integration Examples ===\n');

  try {
    console.log('1. Basic Retrieval Example');
    await basicRetrievalExample();
    console.log('\n');

    console.log('2. RAG Chain with Tracing Example');
    await ragChainWithTracingExample();
    console.log('\n');

    console.log('3. VectorStore MMR Example');
    await vectorStoreMMRExample();
    console.log('\n');

    // Memory and API examples require network access
    // Uncomment when API is available:
    // console.log('4. Memory with Session Example');
    // await memoryWithSessionExample();
    // console.log('\n');

    // console.log('5. API Callback Handler Example');
    // await apiCallbackHandlerExample();
    // console.log('\n');

    console.log('6. Custom Events Example');
    await customEventsExample();
    console.log('\n');

    console.log('7. Batch Processing Example');
    await batchProcessingExample();
    console.log('\n');

    console.log('8. Streaming Example');
    await streamingExample();
    console.log('\n');

    console.log('=== All Examples Completed ===');
  } catch (error) {
    console.error('Example failed:', error);
    throw error;
  }
}
