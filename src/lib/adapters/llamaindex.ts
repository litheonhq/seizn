/**
 * LlamaIndex Adapter
 *
 * Callback handler and vector store integration for LlamaIndex.
 */

import {
  SeizConfig,
  LlamaIndexStorageConfig,
  LlamaIndexCallbackConfig,
  SeizCallbackHandler,
  SeizVectorStoreInterface,
  TracePayload,
} from './types';

// ============================================
// LlamaIndex Callback Handler
// ============================================

export class SeizLlamaIndexCallbackHandler implements SeizCallbackHandler {
  private config: SeizConfig;
  private eventTraces: Map<string, { startTime: number; payload: Partial<TracePayload> }> = new Map();

  constructor(config: SeizConfig) {
    this.config = config;
  }

  private async sendTrace(payload: TracePayload): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl || 'https://seizn.com'}/api/traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          ...payload,
          userId: this.config.userId,
          sessionId: this.config.sessionId,
          namespace: this.config.namespace,
          tags: [...(this.config.tags || []), ...(payload.tags || [])],
          metadata: {
            ...this.config.metadata,
            ...payload.metadata,
            framework: 'llamaindex',
          },
        }),
      });

      if (!response.ok) {
        console.error('[Seiz] Failed to send trace:', await response.text());
      }
    } catch (error) {
      console.error('[Seiz] Error sending trace:', error);
    }
  }

  async onLLMStart(
    llm: { name: string; provider?: string },
    prompts: string[],
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.eventTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `llm.${llm.name}`,
        modelId: llm.name,
        modelProvider: llm.provider,
        input: prompts,
        metadata: {
          ...metadata,
          eventType: 'llm_start',
        },
      },
    });
  }

  async onLLMEnd(
    output: { generations: Array<{ text: string }[]> },
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;
    const completions = output.generations.flat().map((g) => g.text);

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'llm.unknown',
      output: completions,
      latencyMs,
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'llm_end',
      },
    });

    this.eventTraces.delete(runId);
  }

  async onLLMError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'llm.unknown',
      output: { error: error.message },
      latencyMs,
      tags: ['error'],
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'llm_error',
        errorName: error.name,
      },
    });

    this.eventTraces.delete(runId);
  }

  async onChainStart(
    chain: { name: string },
    inputs: Record<string, unknown>,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.eventTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `query.${chain.name}`,
        input: inputs,
        metadata: {
          ...metadata,
          eventType: 'query_start',
        },
      },
    });
  }

  async onChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'query.unknown',
      output: outputs,
      latencyMs,
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'query_end',
      },
    });

    this.eventTraces.delete(runId);
  }

  async onChainError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'query.unknown',
      output: { error: error.message },
      latencyMs,
      tags: ['error'],
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'query_error',
        errorName: error.name,
      },
    });

    this.eventTraces.delete(runId);
  }

  async onToolStart(
    tool: { name: string },
    input: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.eventTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `tool.${tool.name}`,
        input,
        metadata: {
          ...metadata,
          eventType: 'tool_start',
        },
      },
    });
  }

  async onToolEnd(
    output: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'tool.unknown',
      output,
      latencyMs,
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'tool_end',
      },
    });

    this.eventTraces.delete(runId);
  }

  async onToolError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'tool.unknown',
      output: { error: error.message },
      latencyMs,
      tags: ['error'],
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'tool_error',
        errorName: error.name,
      },
    });

    this.eventTraces.delete(runId);
  }

  async onRetrieverStart(
    retriever: { name: string },
    query: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.eventTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `retriever.${retriever.name}`,
        input: query,
        metadata: {
          ...metadata,
          eventType: 'retrieve_start',
        },
      },
    });
  }

  async onRetrieverEnd(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'retriever.unknown',
      output: documents,
      latencyMs,
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'retrieve_end',
        nodeCount: documents.length,
      },
    });

    this.eventTraces.delete(runId);
  }

  async onRetrieverError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.eventTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'retriever.unknown',
      output: { error: error.message },
      latencyMs,
      tags: ['error'],
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        eventType: 'retrieve_error',
        errorName: error.name,
      },
    });

    this.eventTraces.delete(runId);
  }

  // LlamaIndex-specific event handlers
  async onEmbedding(
    eventId: string,
    texts: string[],
    embeddings: number[][],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.sendTrace({
      name: 'embedding.generate',
      input: texts,
      output: { embeddingCount: embeddings.length, dimensions: embeddings[0]?.length },
      metadata: {
        ...metadata,
        eventId,
        eventType: 'embedding',
        textCount: texts.length,
      },
    });
  }

  async onNodeParsing(
    eventId: string,
    documents: Array<{ content: string }>,
    nodes: Array<{ content: string; metadata?: Record<string, unknown> }>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.sendTrace({
      name: 'node.parsing',
      input: { documentCount: documents.length },
      output: { nodeCount: nodes.length },
      metadata: {
        ...metadata,
        eventId,
        eventType: 'node_parsing',
      },
    });
  }

  async onSynthesis(
    eventId: string,
    query: string,
    response: string,
    sourceNodes: Array<{ content: string; score?: number }>,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    await this.sendTrace({
      name: 'response.synthesis',
      input: query,
      output: response,
      metadata: {
        ...metadata,
        eventId,
        eventType: 'synthesis',
        sourceNodeCount: sourceNodes.length,
        sourceNodes: sourceNodes.map((n) => ({ score: n.score, contentLength: n.content.length })),
      },
    });
  }
}

// ============================================
// LlamaIndex Vector Store Integration
// ============================================

export class SeizLlamaIndexVectorStore implements SeizVectorStoreInterface {
  private config: LlamaIndexStorageConfig;
  private collectionName: string;

  constructor(config: LlamaIndexStorageConfig) {
    this.config = config;
    this.collectionName = config.collectionName || 'default';
  }

  async addDocuments(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>
  ): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/vectors/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            collection: this.collectionName,
            documents: documents.map((doc) => ({
              content: doc.content,
              metadata: {
                ...doc.metadata,
                namespace: this.config.namespace,
                framework: 'llamaindex',
              },
            })),
            userId: this.config.userId,
            embeddingDimension: this.config.embeddingDimension,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to add documents: ${error}`);
      }

      const data = await response.json();
      return data.ids || [];
    } catch (error) {
      console.error('[Seiz] Error adding documents:', error);
      throw error;
    }
  }

  async similaritySearch(
    query: string,
    k: number = 4,
    filter?: Record<string, unknown>
  ): Promise<Array<{ content: string; metadata?: Record<string, unknown>; score: number }>> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/vectors/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            collection: this.collectionName,
            query,
            k,
            filter: {
              ...filter,
              namespace: this.config.namespace,
            },
            userId: this.config.userId,
            similarityMetric: this.config.similarityMetric || 'cosine',
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to search: ${error}`);
      }

      const data = await response.json();
      return (data.results || []).map((r: { content: string; metadata?: Record<string, unknown>; score: number }) => ({
        content: r.content,
        metadata: r.metadata,
        score: r.score,
      }));
    } catch (error) {
      console.error('[Seiz] Error searching:', error);
      throw error;
    }
  }

  async delete(ids: string[]): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/vectors/documents`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            collection: this.collectionName,
            ids,
            userId: this.config.userId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to delete documents: ${error}`);
      }
    } catch (error) {
      console.error('[Seiz] Error deleting documents:', error);
      throw error;
    }
  }

  // LlamaIndex-specific methods
  async getNodes(ids: string[]): Promise<Array<{ id: string; content: string; metadata?: Record<string, unknown> }>> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/vectors/nodes`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            collection: this.collectionName,
            ids,
            userId: this.config.userId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get nodes: ${error}`);
      }

      const data = await response.json();
      return data.nodes || [];
    } catch (error) {
      console.error('[Seiz] Error getting nodes:', error);
      throw error;
    }
  }

  async createCollection(name: string, options?: { dimension?: number; metric?: string }): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/vectors/collections`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            name,
            dimension: options?.dimension || this.config.embeddingDimension || 1536,
            metric: options?.metric || this.config.similarityMetric || 'cosine',
            userId: this.config.userId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create collection: ${error}`);
      }
    } catch (error) {
      console.error('[Seiz] Error creating collection:', error);
      throw error;
    }
  }

  async deleteCollection(name: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/vectors/collections/${name}`,
        {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            userId: this.config.userId,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to delete collection: ${error}`);
      }
    } catch (error) {
      console.error('[Seiz] Error deleting collection:', error);
      throw error;
    }
  }
}

// ============================================
// Factory Functions
// ============================================

export function createLlamaIndexCallbackHandler(config: SeizConfig): SeizLlamaIndexCallbackHandler {
  return new SeizLlamaIndexCallbackHandler(config);
}

export function createLlamaIndexVectorStore(config: LlamaIndexStorageConfig): SeizLlamaIndexVectorStore {
  return new SeizLlamaIndexVectorStore(config);
}
