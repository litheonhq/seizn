/**
 * Vercel AI SDK Adapter
 *
 * Stream callbacks and middleware for Vercel AI SDK integration.
 */

import {
  SeizConfig,
  VercelAIConfig,
  VercelAIStreamCallbacks,
  TracePayload,
  MemoryPayload,
} from './types';

// ============================================
// Vercel AI SDK Stream Wrapper
// ============================================

export class SeizVercelAIAdapter {
  private config: VercelAIConfig;
  private activeStreams: Map<string, { startTime: number; tokens: string[]; payload: Partial<TracePayload> }> = new Map();

  constructor(config: VercelAIConfig) {
    this.config = config;
  }

  private async sendTrace(payload: TracePayload): Promise<void> {
    if (!this.config.traceRequests && !this.config.traceResponses) return;

    try {
      const response = await fetch(`${this.config.baseUrl || 'https://www.seizn.com'}/api/traces`, {
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
            framework: 'vercel-ai-sdk',
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

  private async saveMemory(payload: MemoryPayload): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://www.seizn.com'}/api/memories`,
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
              framework: 'vercel-ai-sdk',
            },
          }),
        }
      );

      if (!response.ok) {
        console.error('[Seiz] Failed to save memory:', await response.text());
      }
    } catch (error) {
      console.error('[Seiz] Error saving memory:', error);
    }
  }

  /**
   * Create stream callbacks for Vercel AI SDK streaming responses
   */
  createStreamCallbacks(
    options?: {
      streamId?: string;
      modelId?: string;
      modelProvider?: string;
      input?: unknown;
      saveToMemory?: boolean;
      userCallbacks?: VercelAIStreamCallbacks;
    }
  ): VercelAIStreamCallbacks {
    const streamId = options?.streamId || crypto.randomUUID();

    return {
      onStart: () => {
        this.activeStreams.set(streamId, {
          startTime: Date.now(),
          tokens: [],
          payload: {
            name: 'stream.start',
            modelId: options?.modelId,
            modelProvider: options?.modelProvider,
            input: options?.input,
          },
        });

        if (this.config.traceRequests) {
          this.sendTrace({
            name: 'llm.request',
            modelId: options?.modelId,
            modelProvider: options?.modelProvider,
            input: options?.input,
            metadata: {
              streamId,
              streaming: true,
            },
          });
        }

        options?.userCallbacks?.onStart?.();
      },

      onToken: (token: string) => {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
          stream.tokens.push(token);
        }
        options?.userCallbacks?.onToken?.(token);
      },

      onText: (text: string) => {
        options?.userCallbacks?.onText?.(text);
      },

      onCompletion: async (completion: string) => {
        const stream = this.activeStreams.get(streamId);
        if (stream && this.config.traceResponses) {
          const latencyMs = Date.now() - stream.startTime;

          await this.sendTrace({
            ...stream.payload,
            name: 'llm.response',
            output: completion,
            latencyMs,
            completionTokens: stream.tokens.length,
            metadata: {
              streamId,
              streaming: true,
              tokenCount: stream.tokens.length,
            },
          });
        }

        options?.userCallbacks?.onCompletion?.(completion);
      },

      onFinal: async (completion: string) => {
        const stream = this.activeStreams.get(streamId);

        if (stream) {
          // Save to memory if requested
          if (options?.saveToMemory) {
            await this.saveMemory({
              content: completion,
              memoryType: 'experience',
              metadata: {
                role: 'assistant',
                modelId: options?.modelId,
                streamId,
              },
            });
          }

          this.activeStreams.delete(streamId);
        }

        options?.userCallbacks?.onFinal?.(completion);
      },
    };
  }

  /**
   * Wrap a streaming response with tracing
   */
  wrapStream<T extends ReadableStream>(
    stream: T,
    options?: {
      modelId?: string;
      modelProvider?: string;
      input?: unknown;
    }
  ): T {
    const streamId = crypto.randomUUID();
    const startTime = Date.now();
    const chunks: string[] = [];
    const decoder = new TextDecoder();

    const transformStream = new TransformStream({
      start: () => {
        if (this.config.traceRequests) {
          this.sendTrace({
            name: 'stream.start',
            modelId: options?.modelId,
            modelProvider: options?.modelProvider,
            input: options?.input,
            metadata: { streamId },
          });
        }
      },
      transform: (chunk, controller) => {
        const text = decoder.decode(chunk, { stream: true });
        chunks.push(text);
        controller.enqueue(chunk);
      },
      flush: () => {
        if (this.config.traceResponses) {
          const latencyMs = Date.now() - startTime;
          const fullText = chunks.join('');

          this.sendTrace({
            name: 'stream.complete',
            modelId: options?.modelId,
            modelProvider: options?.modelProvider,
            input: options?.input,
            output: fullText,
            latencyMs,
            metadata: {
              streamId,
              chunkCount: chunks.length,
            },
          });
        }
      },
    });

    return stream.pipeThrough(transformStream) as T;
  }

  /**
   * Create middleware for Next.js API routes
   */
  createMiddleware() {
    return async (
      request: Request,
      handler: (req: Request) => Promise<Response>
    ): Promise<Response> => {
      const startTime = Date.now();
      const requestId = crypto.randomUUID();

      // Parse request body for tracing
      let requestBody: unknown;
      try {
        const clonedRequest = request.clone();
        requestBody = await clonedRequest.json();
      } catch {
        requestBody = null;
      }

      if (this.config.traceRequests) {
        await this.sendTrace({
          name: 'api.request',
          input: requestBody,
          metadata: {
            requestId,
            method: request.method,
            url: request.url,
          },
        });
      }

      try {
        const response = await handler(request);
        const latencyMs = Date.now() - startTime;

        if (this.config.traceResponses) {
          await this.sendTrace({
            name: 'api.response',
            input: requestBody,
            output: { status: response.status },
            latencyMs,
            metadata: {
              requestId,
              status: response.status,
            },
          });
        }

        return response;
      } catch (error) {
        const latencyMs = Date.now() - startTime;

        await this.sendTrace({
          name: 'api.error',
          input: requestBody,
          output: { error: error instanceof Error ? error.message : 'Unknown error' },
          latencyMs,
          tags: ['error'],
          metadata: {
            requestId,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          },
        });

        throw error;
      }
    };
  }

  /**
   * Trace a chat completion request
   */
  async traceCompletion(options: {
    modelId: string;
    modelProvider?: string;
    messages: Array<{ role: string; content: string }>;
    response: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
    saveToMemory?: boolean;
  }): Promise<void> {
    const startTime = options.latencyMs ? Date.now() - options.latencyMs : Date.now();

    await this.sendTrace({
      name: 'chat.completion',
      modelId: options.modelId,
      modelProvider: options.modelProvider,
      input: options.messages,
      output: options.response,
      latencyMs: options.latencyMs || 0,
      promptTokens: options.promptTokens,
      completionTokens: options.completionTokens,
      totalTokens: options.totalTokens,
      cost: options.cost,
    });

    if (options.saveToMemory) {
      // Save the last user message
      const lastUserMessage = [...options.messages].reverse().find((m) => m.role === 'user');
      if (lastUserMessage) {
        await this.saveMemory({
          content: lastUserMessage.content,
          memoryType: 'experience',
          metadata: { role: 'user' },
        });
      }

      // Save the assistant response
      await this.saveMemory({
        content: options.response,
        memoryType: 'experience',
        metadata: {
          role: 'assistant',
          modelId: options.modelId,
        },
      });
    }
  }

  /**
   * Trace a tool call
   */
  async traceToolCall(options: {
    toolName: string;
    input: unknown;
    output: unknown;
    latencyMs?: number;
    error?: Error;
  }): Promise<void> {
    await this.sendTrace({
      name: `tool.${options.toolName}`,
      input: options.input,
      output: options.error ? { error: options.error.message } : options.output,
      latencyMs: options.latencyMs || 0,
      tags: options.error ? ['error'] : undefined,
      metadata: options.error
        ? {
            errorName: options.error.name,
            errorMessage: options.error.message,
          }
        : undefined,
    });
  }

  /**
   * Search memories for context
   */
  async searchMemories(query: string, options?: { limit?: number; threshold?: number }) {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://www.seizn.com'}/api/memories/search`,
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
            limit: options?.limit || 10,
            threshold: options?.threshold || 0.7,
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

  /**
   * Get conversation history for context
   */
  async getConversationHistory(options?: { limit?: number }) {
    try {
      const response = await fetch(
        `${this.config.baseUrl || 'https://www.seizn.com'}/api/memories/history`,
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
            limit: options?.limit || 20,
          }),
        }
      );

      if (!response.ok) {
        console.error('[Seiz] Failed to get history:', await response.text());
        return [];
      }

      const data = await response.json();
      return (data.memories || []).map((m: { content: string; metadata?: { role?: string } }) => ({
        role: m.metadata?.role || 'user',
        content: m.content,
      }));
    } catch (error) {
      console.error('[Seiz] Error getting history:', error);
      return [];
    }
  }
}

// ============================================
// Factory Function
// ============================================

export function createVercelAIAdapter(config: VercelAIConfig): SeizVercelAIAdapter {
  return new SeizVercelAIAdapter(config);
}

// ============================================
// Convenience Exports
// ============================================

export type { VercelAIConfig, VercelAIStreamCallbacks };
