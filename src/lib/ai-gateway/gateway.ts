/**
 * AI Gateway - Main Implementation
 *
 * Unified interface for multiple LLM providers with:
 * - Load balancing
 * - Circuit breaker
 * - Automatic retries
 * - Cost tracking
 * - Health monitoring
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

import type {
  GatewayConfig,
  GatewayRequest,
  GatewayResponse,
  GatewayError,
  ProviderConfig,
  ProviderHealth,
  LLMProvider,
  RoutingDecision,
} from './types';

import {
  canMakeRequest,
  recordSuccess,
  recordFailure,
  getCircuitState,
} from './circuit-breaker';

import {
  selectProvider,
  incrementConnections,
  decrementConnections,
  recordLatency,
  estimateCost,
} from './load-balancer';

import { withRetry, DEFAULT_RETRY_CONFIG } from './retry';
import {
  getGatewayResponseCache,
  setGatewayResponseCache,
} from './response-cache';
import {
  buildAnthropicSdkDefaultHeaders,
  buildCachedSystemPrompt,
  extractAnthropicCacheUsage,
  isAnthropicPromptCachingEnabled,
} from '../anthropic/prompt-caching';

// Provider clients (singletons)
let openaiClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let googleClient: GoogleGenerativeAI | null = null;

// Provider health status
const providerHealth = new Map<string, ProviderHealth>();

// Default gateway configuration
const DEFAULT_CONFIG: GatewayConfig = {
  providers: [],
  loadBalancer: {
    strategy: 'failover',
    healthCheckInterval: 30000,
    stickySession: false,
    sessionTTL: 300000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 3,
    timeout: 30000,
    volumeThreshold: 10,
  },
  defaultTimeout: 60000,
  maxRetries: 3,
  cacheEnabled: true,
  cacheTTL: 300000,
  costTracking: true,
  telemetryEnabled: true,
};

/**
 * AI Gateway class
 */
export class AIGateway {
  private config: GatewayConfig;
  private providers: Map<string, ProviderConfig>;

  constructor(config: Partial<GatewayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.providers = new Map();

    // Initialize default providers from environment
    this.initializeDefaultProviders();
  }

  /**
   * Initialize default providers from environment variables
   */
  private initializeDefaultProviders(): void {
    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.addProvider({
        id: 'openai-default',
        name: 'OpenAI',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini'],
        enabled: true,
        priority: 1,
        weight: 50,
        maxConcurrent: 100,
        rateLimit: { requestsPerMinute: 500, tokensPerMinute: 150000 },
        timeout: 60000,
        retryConfig: DEFAULT_RETRY_CONFIG,
      });
    }

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.addProvider({
        id: 'anthropic-default',
        name: 'Anthropic',
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
        enabled: true,
        priority: 2,
        weight: 30,
        maxConcurrent: 50,
        rateLimit: { requestsPerMinute: 300, tokensPerMinute: 100000 },
        timeout: 60000,
        retryConfig: DEFAULT_RETRY_CONFIG,
      });
    }

    // Google
    if (process.env.GOOGLE_API_KEY) {
      this.addProvider({
        id: 'google-default',
        name: 'Google AI',
        provider: 'google',
        apiKey: process.env.GOOGLE_API_KEY,
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
        enabled: true,
        priority: 3,
        weight: 20,
        maxConcurrent: 50,
        rateLimit: { requestsPerMinute: 300, tokensPerMinute: 100000 },
        timeout: 60000,
        retryConfig: DEFAULT_RETRY_CONFIG,
      });
    }
  }

  /**
   * Add a provider configuration
   */
  addProvider(config: ProviderConfig): void {
    this.providers.set(config.id, config);

    // Initialize health status
    providerHealth.set(config.id, {
      providerId: config.id,
      provider: config.provider,
      status: 'healthy',
      latencyMs: 0,
      errorRate: 0,
      lastCheck: new Date(),
      activeRequests: 0,
      circuitState: 'closed',
    });
  }

  /**
   * Remove a provider
   */
  removeProvider(providerId: string): void {
    this.providers.delete(providerId);
    providerHealth.delete(providerId);
  }

  /**
   * Get provider client
   */
  private getProviderClient(provider: LLMProvider, apiKey?: string): OpenAI | Anthropic | GoogleGenerativeAI {
    switch (provider) {
      case 'openai':
        if (!openaiClient) {
          openaiClient = new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY });
        }
        return openaiClient;

      case 'anthropic':
        if (!anthropicClient) {
          anthropicClient = new Anthropic({
            apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
            defaultHeaders: buildAnthropicSdkDefaultHeaders(),
          });
        }
        return anthropicClient;

      case 'google':
        if (!googleClient) {
          googleClient = new GoogleGenerativeAI(apiKey || process.env.GOOGLE_API_KEY || '');
        }
        return googleClient;

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Route and execute a chat request
   */
  async chat(request: GatewayRequest): Promise<GatewayResponse> {
    const startTime = Date.now();

    if (this.config.cacheEnabled) {
      const cachedResponse = getGatewayResponseCache(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Select provider
    const routing = this.selectProvider(request.model, request.preferredProvider);
    if (!routing) {
      throw this.createError('NO_AVAILABLE_PROVIDER', 'No healthy provider available for model', false);
    }

    const providerConfig = this.providers.get(routing.providerId)!;

    // Execute with retry and circuit breaker
    try {
      incrementConnections(routing.providerId);

      const response = await withRetry(
        async () => {
          if (!canMakeRequest(routing.providerId, this.config.circuitBreaker)) {
            throw this.createError('CIRCUIT_OPEN', 'Circuit breaker is open', true);
          }

          return this.executeRequest(request, providerConfig, routing);
        },
        providerConfig.retryConfig,
        (attempt, error, delayMs) => {
          console.log(`[AIGateway] Retry ${attempt} for ${routing.providerId}: ${error.message}, waiting ${delayMs}ms`);
        }
      );

      recordSuccess(routing.providerId, this.config.circuitBreaker);
      recordLatency(routing.providerId, Date.now() - startTime);

      if (this.config.cacheEnabled && !response.cached) {
        setGatewayResponseCache(request, response, this.config.cacheTTL);
      }

      return response;
    } catch (error) {
      recordFailure(routing.providerId, this.config.circuitBreaker);

      // Try fallback providers
      for (const alternate of routing.alternates) {
        try {
          const altConfig = this.providers.get(alternate.providerId);
          if (!altConfig || !canMakeRequest(alternate.providerId, this.config.circuitBreaker)) {
            continue;
          }

          console.log(`[AIGateway] Falling back to ${alternate.providerId}`);
          incrementConnections(alternate.providerId);

          const response = await this.executeRequest(request, altConfig, {
            ...routing,
            providerId: alternate.providerId,
            provider: alternate.provider,
          });

          recordSuccess(alternate.providerId, this.config.circuitBreaker);

          if (this.config.cacheEnabled && !response.cached) {
            setGatewayResponseCache(request, response, this.config.cacheTTL);
          }

          return response;
        } catch {
          recordFailure(alternate.providerId, this.config.circuitBreaker);
        } finally {
          decrementConnections(alternate.providerId);
        }
      }

      throw error;
    } finally {
      decrementConnections(routing.providerId);
    }
  }

  /**
   * Execute request to specific provider
   */
  private async executeRequest(
    request: GatewayRequest,
    config: ProviderConfig,
    routing: RoutingDecision
  ): Promise<GatewayResponse> {
    const startTime = Date.now();

    switch (config.provider) {
      case 'openai':
        return this.executeOpenAI(request, config, routing, startTime);

      case 'anthropic':
        return this.executeAnthropic(request, config, routing, startTime);

      case 'google':
        return this.executeGoogle(request, config, routing, startTime);

      default:
        throw this.createError('UNSUPPORTED_PROVIDER', `Provider ${config.provider} not supported`, false);
    }
  }

  /**
   * Execute OpenAI request
   */
  private async executeOpenAI(
    request: GatewayRequest,
    config: ProviderConfig,
    routing: RoutingDecision,
    startTime: number
  ): Promise<GatewayResponse> {
    const client = this.getProviderClient('openai', config.apiKey) as OpenAI;

    const response = await client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    });

    const latencyMs = Date.now() - startTime;
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    return {
      id: response.id,
      requestId: request.id,
      provider: 'openai',
      model: response.model,
      content: response.choices[0]?.message?.content || '',
      finishReason: response.choices[0]?.finish_reason as GatewayResponse['finishReason'] || 'stop',
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
      latencyMs,
      cost: estimateCost(request.model, usage.prompt_tokens, usage.completion_tokens),
      cached: false,
    };
  }

  /**
   * Execute Anthropic request
   */
  private async executeAnthropic(
    request: GatewayRequest,
    config: ProviderConfig,
    routing: RoutingDecision,
    startTime: number
  ): Promise<GatewayResponse> {
    const client = this.getProviderClient('anthropic', config.apiKey) as Anthropic;

    // Extract system message
    const systemMessage = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');
    const cachedSystemPrompt = buildCachedSystemPrompt(systemMessage?.content);

    const response = await client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens || 4096,
      system: cachedSystemPrompt,
      messages: otherMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    const latencyMs = Date.now() - startTime;
    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const usage = response.usage;
    const cacheUsage = extractAnthropicCacheUsage(usage);
    const baseInputTokens = usage?.input_tokens ?? 0;
    const completionTokens = usage?.output_tokens ?? 0;
    const promptTokens = baseInputTokens + cacheUsage.cacheCreationInputTokens + cacheUsage.cacheReadInputTokens;
    const totalTokens = promptTokens + completionTokens;

    return {
      id: response.id,
      requestId: request.id,
      provider: 'anthropic',
      model: response.model,
      content,
      finishReason: response.stop_reason as GatewayResponse['finishReason'] || 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
      latencyMs,
      cost: estimateCost(request.model, promptTokens, completionTokens),
      cached: false,
      metadata: {
        ...request.metadata,
        anthropicPromptCachingEnabled: isAnthropicPromptCachingEnabled(),
        anthropicBaseInputTokens: baseInputTokens,
        anthropicCacheCreationInputTokens: cacheUsage.cacheCreationInputTokens,
        anthropicCacheReadInputTokens: cacheUsage.cacheReadInputTokens,
      },
    };
  }

  /**
   * Execute Google request
   */
  private async executeGoogle(
    request: GatewayRequest,
    config: ProviderConfig,
    routing: RoutingDecision,
    startTime: number
  ): Promise<GatewayResponse> {
    const client = this.getProviderClient('google', config.apiKey) as GoogleGenerativeAI;
    const model = client.getGenerativeModel({ model: request.model });

    // Build chat history
    const history = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    const chat = model.startChat({
      history: history.slice(0, -1) as Array<{ role: 'user' | 'model'; parts: { text: string }[] }>,
    });

    const lastMessage = request.messages[request.messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = await result.response;

    const latencyMs = Date.now() - startTime;
    const text = response.text();

    // Google doesn't provide token counts directly in all cases
    const estimatedTokens = Math.ceil((text.length + lastMessage.content.length) / 4);

    return {
      id: crypto.randomUUID(),
      requestId: request.id,
      provider: 'google',
      model: request.model,
      content: text,
      finishReason: 'stop',
      usage: {
        promptTokens: Math.ceil(lastMessage.content.length / 4),
        completionTokens: Math.ceil(text.length / 4),
        totalTokens: estimatedTokens,
      },
      latencyMs,
      cost: estimateCost(request.model, estimatedTokens / 2, estimatedTokens / 2),
      cached: false,
    };
  }

  /**
   * Select provider for model
   */
  private selectProvider(model: string, preferred?: LLMProvider): RoutingDecision | null {
    const providers = Array.from(this.providers.values());

    // Filter by preferred provider if specified
    const filteredProviders = preferred
      ? providers.filter((p) => p.provider === preferred)
      : providers;

    return selectProvider(
      filteredProviders.length > 0 ? filteredProviders : providers,
      this.config.loadBalancer.strategy,
      model,
      providerHealth
    );
  }

  /**
   * Create gateway error
   */
  private createError(code: string, message: string, retryable: boolean): GatewayError {
    return { code, message, retryable };
  }

  /**
   * Get provider health status
   */
  getHealth(): Map<string, ProviderHealth> {
    // Update circuit states
    for (const [id, health] of providerHealth) {
      const circuitState = getCircuitState(id);
      health.circuitState = circuitState.state;
    }
    return new Map(providerHealth);
  }

  /**
   * Get gateway configuration
   */
  getConfig(): GatewayConfig {
    return this.config;
  }

  /**
   * Update gateway configuration
   */
  updateConfig(config: Partial<GatewayConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton gateway instance
let gatewayInstance: AIGateway | null = null;

/**
 * Get or create gateway instance
 */
export function getGateway(): AIGateway {
  if (!gatewayInstance) {
    gatewayInstance = new AIGateway();
  }
  return gatewayInstance;
}

/**
 * Reset gateway instance (for testing)
 */
export function resetGateway(): void {
  gatewayInstance = null;
}
