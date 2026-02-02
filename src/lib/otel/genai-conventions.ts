/**
 * OpenTelemetry GenAI Semantic Conventions
 *
 * Based on OpenTelemetry GenAI semantic conventions:
 * https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/
 *
 * @module otel/genai-conventions
 */

// ============================================
// GenAI Semantic Attribute Keys
// ============================================

/**
 * GenAI operation semantic attributes
 */
export const GenAIAttributes = {
  // Operation
  OPERATION_NAME: 'gen_ai.operation.name',

  // System/Provider
  SYSTEM: 'gen_ai.system',

  // Request attributes
  REQUEST_MODEL: 'gen_ai.request.model',
  REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  REQUEST_TOP_P: 'gen_ai.request.top_p',
  REQUEST_TOP_K: 'gen_ai.request.top_k',
  REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
  REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
  REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',

  // Response attributes
  RESPONSE_MODEL: 'gen_ai.response.model',
  RESPONSE_ID: 'gen_ai.response.id',
  RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

  // Usage attributes
  USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',
  USAGE_TOTAL_TOKENS: 'gen_ai.usage.total_tokens',

  // Prompt/Completion (for events)
  PROMPT: 'gen_ai.prompt',
  COMPLETION: 'gen_ai.completion',
} as const;

/**
 * LLM semantic attributes (legacy, for compatibility)
 */
export const LLMAttributes = {
  SYSTEM: 'llm.system',
  REQUEST_TYPE: 'llm.request.type',
  VENDOR: 'llm.vendor',
} as const;

/**
 * Embedding semantic attributes
 */
export const EmbeddingAttributes = {
  MODEL: 'embedding.model',
  DIMENSIONS: 'embedding.dimensions',
  INPUT_COUNT: 'embedding.input.count',
  INPUT_TYPE: 'embedding.input.type',
} as const;

/**
 * Reranking semantic attributes
 */
export const RerankAttributes = {
  MODEL: 'rerank.model',
  QUERY: 'rerank.query',
  TOP_N: 'rerank.top_n',
  DOCUMENTS_COUNT: 'rerank.documents.count',
} as const;

/**
 * Vector database semantic attributes
 */
export const VectorDBAttributes = {
  SYSTEM: 'db.system',
  OPERATION: 'db.operation',
  COLLECTION_NAME: 'db.collection.name',
  VECTOR_DIMENSIONS: 'db.vector.dimensions',
  VECTOR_SIMILARITY_METRIC: 'db.vector.similarity_metric',
  RESULTS_COUNT: 'db.results.count',
} as const;

// ============================================
// GenAI Operation Types
// ============================================

export type GenAIOperationType =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'rerank'
  | 'retrieval'
  | 'memory.add'
  | 'memory.search'
  | 'memory.delete'
  | 'tool.call';

// ============================================
// GenAI System/Provider Types
// ============================================

export type GenAISystem =
  | 'seizn'
  | 'openai'
  | 'anthropic'
  | 'cohere'
  | 'google'
  | 'azure'
  | 'aws'
  | 'huggingface'
  | 'together'
  | 'fireworks'
  | 'groq'
  | 'ollama';

// ============================================
// Mapping Functions
// ============================================

/**
 * Map Seizn model names to GenAI system identifiers
 */
export function mapModelToSystem(model: string): GenAISystem {
  const lowerModel = model.toLowerCase();

  if (lowerModel.includes('gpt') || lowerModel.includes('text-embedding-ada')) {
    return 'openai';
  }
  if (lowerModel.includes('claude')) {
    return 'anthropic';
  }
  if (lowerModel.includes('cohere') || lowerModel.includes('rerank')) {
    return 'cohere';
  }
  if (lowerModel.includes('gemini') || lowerModel.includes('palm')) {
    return 'google';
  }
  if (lowerModel.includes('llama') || lowerModel.includes('mistral')) {
    return 'together';
  }

  // Default to seizn for internal operations
  return 'seizn';
}

/**
 * Map Seizn span types to GenAI operation types
 */
export function mapSpanToOperation(spanName: string): GenAIOperationType {
  const mapping: Record<string, GenAIOperationType> = {
    embedding: 'embedding',
    vector_search: 'retrieval',
    keyword_search: 'retrieval',
    rerank: 'rerank',
    llm_generation: 'chat',
    memory_add: 'memory.add',
    memory_search: 'memory.search',
    memory_delete: 'memory.delete',
    tool_call: 'tool.call',
  };

  return mapping[spanName] || 'retrieval';
}

// ============================================
// Attribute Builders
// ============================================

export interface GenAISpanAttributes {
  operation: GenAIOperationType;
  system: GenAISystem;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  maxTokens?: number;
  temperature?: number;
  finishReason?: string;
  responseId?: string;
}

/**
 * Build GenAI semantic convention attributes for a span
 */
export function buildGenAIAttributes(
  params: GenAISpanAttributes
): Record<string, string | number | boolean | string[]> {
  const attrs: Record<string, string | number | boolean | string[]> = {
    [GenAIAttributes.OPERATION_NAME]: params.operation,
    [GenAIAttributes.SYSTEM]: params.system,
  };

  if (params.model) {
    attrs[GenAIAttributes.REQUEST_MODEL] = params.model;
    attrs[GenAIAttributes.RESPONSE_MODEL] = params.model;
  }

  if (params.inputTokens !== undefined) {
    attrs[GenAIAttributes.USAGE_INPUT_TOKENS] = params.inputTokens;
  }

  if (params.outputTokens !== undefined) {
    attrs[GenAIAttributes.USAGE_OUTPUT_TOKENS] = params.outputTokens;
  }

  if (params.inputTokens !== undefined && params.outputTokens !== undefined) {
    attrs[GenAIAttributes.USAGE_TOTAL_TOKENS] =
      params.inputTokens + params.outputTokens;
  }

  if (params.maxTokens !== undefined) {
    attrs[GenAIAttributes.REQUEST_MAX_TOKENS] = params.maxTokens;
  }

  if (params.temperature !== undefined) {
    attrs[GenAIAttributes.REQUEST_TEMPERATURE] = params.temperature;
  }

  if (params.finishReason) {
    attrs[GenAIAttributes.RESPONSE_FINISH_REASONS] = [params.finishReason];
  }

  if (params.responseId) {
    attrs[GenAIAttributes.RESPONSE_ID] = params.responseId;
  }

  return attrs;
}

/**
 * Build embedding-specific attributes
 */
export function buildEmbeddingAttributes(params: {
  model: string;
  dimensions?: number;
  inputCount?: number;
  inputType?: 'document' | 'query';
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    [GenAIAttributes.OPERATION_NAME]: 'embedding',
    [GenAIAttributes.SYSTEM]: mapModelToSystem(params.model),
    [EmbeddingAttributes.MODEL]: params.model,
  };

  if (params.dimensions !== undefined) {
    attrs[EmbeddingAttributes.DIMENSIONS] = params.dimensions;
  }

  if (params.inputCount !== undefined) {
    attrs[EmbeddingAttributes.INPUT_COUNT] = params.inputCount;
  }

  if (params.inputType) {
    attrs[EmbeddingAttributes.INPUT_TYPE] = params.inputType;
  }

  return attrs;
}

/**
 * Build rerank-specific attributes
 */
export function buildRerankAttributes(params: {
  model: string;
  query?: string;
  topN?: number;
  documentsCount?: number;
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    [GenAIAttributes.OPERATION_NAME]: 'rerank',
    [GenAIAttributes.SYSTEM]: mapModelToSystem(params.model),
    [RerankAttributes.MODEL]: params.model,
  };

  if (params.query) {
    // Truncate query for safety
    attrs[RerankAttributes.QUERY] = params.query.slice(0, 256);
  }

  if (params.topN !== undefined) {
    attrs[RerankAttributes.TOP_N] = params.topN;
  }

  if (params.documentsCount !== undefined) {
    attrs[RerankAttributes.DOCUMENTS_COUNT] = params.documentsCount;
  }

  return attrs;
}

/**
 * Build vector search attributes
 */
export function buildVectorSearchAttributes(params: {
  collectionName?: string;
  dimensions?: number;
  metric?: 'cosine' | 'euclidean' | 'dot_product';
  resultsCount?: number;
}): Record<string, string | number> {
  const attrs: Record<string, string | number> = {
    [VectorDBAttributes.SYSTEM]: 'pgvector',
    [VectorDBAttributes.OPERATION]: 'search',
  };

  if (params.collectionName) {
    attrs[VectorDBAttributes.COLLECTION_NAME] = params.collectionName;
  }

  if (params.dimensions !== undefined) {
    attrs[VectorDBAttributes.VECTOR_DIMENSIONS] = params.dimensions;
  }

  if (params.metric) {
    attrs[VectorDBAttributes.VECTOR_SIMILARITY_METRIC] = params.metric;
  }

  if (params.resultsCount !== undefined) {
    attrs[VectorDBAttributes.RESULTS_COUNT] = params.resultsCount;
  }

  return attrs;
}
