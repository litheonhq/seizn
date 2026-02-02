/**
 * LangChain Adapter
 *
 * Callback handler and memory integration for LangChain.
 */

import {
  SeizConfig,
  LangChainMemoryConfig,
  LangChainCallbackConfig,
  SeizCallbackHandler,
  SeizMemoryInterface,
  TracePayload,
  MemoryPayload,
  MemoryResult,
} from './types';

// ============================================
// LangChain Callback Handler
// ============================================

export class SeizLangChainCallbackHandler implements SeizCallbackHandler {
  private config: SeizConfig;
  private runTraces: Map<string, { startTime: number; payload: Partial<TracePayload> }> = new Map();

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
            framework: 'langchain',
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
    this.runTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `llm.${llm.name}`,
        modelId: llm.name,
        modelProvider: llm.provider,
        input: prompts,
        metadata: {
          ...metadata,
          promptCount: prompts.length,
        },
      },
    });
  }

  async onLLMEnd(
    output: { generations: Array<{ text: string }[]> },
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;
    const generations = output.generations.flat().map((g) => g.text);

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'llm.unknown',
      output: generations,
      latencyMs,
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        generationCount: generations.length,
      },
    });

    this.runTraces.delete(runId);
  }

  async onLLMError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
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
        errorName: error.name,
        errorMessage: error.message,
      },
    });

    this.runTraces.delete(runId);
  }

  async onChainStart(
    chain: { name: string },
    inputs: Record<string, unknown>,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.runTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `chain.${chain.name}`,
        input: inputs,
        metadata,
      },
    });
  }

  async onChainEnd(
    outputs: Record<string, unknown>,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'chain.unknown',
      output: outputs,
      latencyMs,
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
      },
    });

    this.runTraces.delete(runId);
  }

  async onChainError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
    if (!trace) return;

    const latencyMs = Date.now() - trace.startTime;

    await this.sendTrace({
      ...trace.payload,
      name: trace.payload.name || 'chain.unknown',
      output: { error: error.message },
      latencyMs,
      tags: ['error'],
      metadata: {
        ...trace.payload.metadata,
        ...metadata,
        errorName: error.name,
        errorMessage: error.message,
      },
    });

    this.runTraces.delete(runId);
  }

  async onToolStart(
    tool: { name: string },
    input: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.runTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `tool.${tool.name}`,
        input,
        metadata,
      },
    });
  }

  async onToolEnd(
    output: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
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
      },
    });

    this.runTraces.delete(runId);
  }

  async onToolError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
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
        errorName: error.name,
        errorMessage: error.message,
      },
    });

    this.runTraces.delete(runId);
  }

  async onRetrieverStart(
    retriever: { name: string },
    query: string,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    this.runTraces.set(runId, {
      startTime: Date.now(),
      payload: {
        name: `retriever.${retriever.name}`,
        input: query,
        metadata,
      },
    });
  }

  async onRetrieverEnd(
    documents: Array<{ content: string; metadata?: Record<string, unknown> }>,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
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
        documentCount: documents.length,
      },
    });

    this.runTraces.delete(runId);
  }

  async onRetrieverError(
    error: Error,
    runId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const trace = this.runTraces.get(runId);
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
        errorName: error.name,
        errorMessage: error.message,
      },
    });

    this.runTraces.delete(runId);
  }
}

// ============================================
// LangChain Memory Integration
// ============================================

export class SeizLangChainMemory implements SeizMemoryInterface {
  private config: LangChainMemoryConfig;
  private memoryKey: string;
  private inputKey: string;
  private outputKey: string;
  private humanPrefix: string;
  private aiPrefix: string;
  private returnMessages: boolean;

  constructor(config: LangChainMemoryConfig) {
    this.config = config;
    this.memoryKey = config.memoryKey || 'history';
    this.inputKey = config.inputKey || 'input';
    this.outputKey = config.outputKey || 'output';
    this.humanPrefix = config.humanPrefix || 'Human';
    this.aiPrefix = config.aiPrefix || 'AI';
    this.returnMessages = config.returnMessages ?? true;
  }

  private async searchMemories(query: string): Promise<MemoryResult[]> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/memories/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            query,
            userId: this.config.userId,
            sessionId: this.config.sessionId,
            namespace: this.config.namespace,
            limit: 10,
            includeMetadata: true,
          }),
        }
      );

      if (!response.ok) {
        console.error('[Seiz] Failed to search memories:', await response.text());
        return [];
      }

      const data = await response.json();
      return data.memories || [];
    } catch (error) {
      console.error('[Seiz] Error searching memories:', error);
      return [];
    }
  }

  private async addMemory(payload: MemoryPayload): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/memories`,
        {
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
            tags: this.config.tags,
            metadata: {
              ...this.config.metadata,
              ...payload.metadata,
              framework: 'langchain',
            },
          }),
        }
      );

      if (!response.ok) {
        console.error('[Seiz] Failed to add memory:', await response.text());
      }
    } catch (error) {
      console.error('[Seiz] Error adding memory:', error);
    }
  }

  async loadMemoryVariables(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const query = String(inputs[this.inputKey] || '');

    if (!query) {
      return { [this.memoryKey]: this.returnMessages ? [] : '' };
    }

    const memories = await this.searchMemories(query);

    if (this.returnMessages) {
      // Return as message objects
      const messages = memories.map((m) => ({
        type: m.metadata?.role === 'assistant' ? 'ai' : 'human',
        content: m.content,
        metadata: m.metadata,
      }));
      return { [this.memoryKey]: messages };
    } else {
      // Return as formatted string
      const formattedHistory = memories
        .map((m) => {
          const prefix = m.metadata?.role === 'assistant' ? this.aiPrefix : this.humanPrefix;
          return `${prefix}: ${m.content}`;
        })
        .join('\n');
      return { [this.memoryKey]: formattedHistory };
    }
  }

  async saveContext(
    inputs: Record<string, unknown>,
    outputs: Record<string, unknown>
  ): Promise<void> {
    const inputText = String(inputs[this.inputKey] || '');
    const outputText = String(outputs[this.outputKey] || '');

    // Save human message
    if (inputText) {
      await this.addMemory({
        content: inputText,
        memoryType: 'experience',
        metadata: {
          role: 'user',
          prefix: this.humanPrefix,
        },
      });
    }

    // Save AI message
    if (outputText) {
      await this.addMemory({
        content: outputText,
        memoryType: 'experience',
        metadata: {
          role: 'assistant',
          prefix: this.aiPrefix,
        },
      });
    }
  }

  async clear(): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://seizn.com'}/api/memories/clear`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            userId: this.config.userId,
            sessionId: this.config.sessionId,
            namespace: this.config.namespace,
          }),
        }
      );

      if (!response.ok) {
        console.error('[Seiz] Failed to clear memories:', await response.text());
      }
    } catch (error) {
      console.error('[Seiz] Error clearing memories:', error);
    }
  }
}

// ============================================
// Factory Functions
// ============================================

export function createLangChainCallbackHandler(config: SeizConfig): SeizLangChainCallbackHandler {
  return new SeizLangChainCallbackHandler(config);
}

export function createLangChainMemory(config: LangChainMemoryConfig): SeizLangChainMemory {
  return new SeizLangChainMemory(config);
}
