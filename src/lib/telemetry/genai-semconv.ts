/**
 * Seizn Telemetry - OpenTelemetry GenAI Semantic Conventions
 *
 * Implements OTEL GenAI semantic conventions for full compatibility
 * with any OpenTelemetry backend (Collector, Jaeger, etc.)
 *
 * @see https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

import { Span, SpanKind, SpanStatusCode, trace, context } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import crypto from 'crypto';

// ============================================
// GenAI Semantic Convention Attribute Names
// ============================================

/**
 * GenAI-specific semantic convention attributes
 * Based on OTEL GenAI semconv spec
 */
export const GenAIAttributes = {
  // System attributes
  GEN_AI_SYSTEM: 'gen_ai.system',
  GEN_AI_REQUEST_MODEL: 'gen_ai.request.model',
  GEN_AI_REQUEST_MAX_TOKENS: 'gen_ai.request.max_tokens',
  GEN_AI_REQUEST_TEMPERATURE: 'gen_ai.request.temperature',
  GEN_AI_REQUEST_TOP_P: 'gen_ai.request.top_p',
  GEN_AI_REQUEST_TOP_K: 'gen_ai.request.top_k',
  GEN_AI_REQUEST_STOP_SEQUENCES: 'gen_ai.request.stop_sequences',
  GEN_AI_REQUEST_FREQUENCY_PENALTY: 'gen_ai.request.frequency_penalty',
  GEN_AI_REQUEST_PRESENCE_PENALTY: 'gen_ai.request.presence_penalty',

  // Response attributes
  GEN_AI_RESPONSE_ID: 'gen_ai.response.id',
  GEN_AI_RESPONSE_MODEL: 'gen_ai.response.model',
  GEN_AI_RESPONSE_FINISH_REASONS: 'gen_ai.response.finish_reasons',

  // Usage attributes
  GEN_AI_USAGE_INPUT_TOKENS: 'gen_ai.usage.input_tokens',
  GEN_AI_USAGE_OUTPUT_TOKENS: 'gen_ai.usage.output_tokens',

  // Content attributes (privacy-safe)
  GEN_AI_PROMPT: 'gen_ai.prompt',
  GEN_AI_COMPLETION: 'gen_ai.completion',

  // Tool/Function calling
  GEN_AI_TOOL_NAME: 'gen_ai.tool.name',
  GEN_AI_TOOL_CALL_ID: 'gen_ai.tool.call_id',

  // Seizn-specific extensions
  SEIZN_MEMORY_ID: 'seizn.memory.id',
  SEIZN_CONVERSATION_ID: 'seizn.conversation.id',
  SEIZN_ORGANIZATION_ID: 'seizn.organization.id',
  SEIZN_USER_ID: 'seizn.user.id',
  SEIZN_GUARD_ENABLED: 'seizn.guard.enabled',
  SEIZN_POLICY_APPLIED: 'seizn.policy.applied',
} as const;

// ============================================
// Types
// ============================================

export type GenAISystem = 'openai' | 'anthropic' | 'google' | 'cohere' | 'seizn';

export interface GenAIRequestAttributes {
  system: GenAISystem;
  model: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface GenAIResponseAttributes {
  id?: string;
  model?: string;
  finishReasons?: string[];
  inputTokens?: number;
  outputTokens?: number;
}

export interface GenAIContentCapture {
  mode: 'off' | 'hash' | 'full';
  hashAlgorithm?: 'sha256' | 'sha512';
}

export interface SeizContextAttributes {
  organizationId?: string;
  userId?: string;
  conversationId?: string;
  memoryId?: string;
  guardEnabled?: boolean;
  policyApplied?: string[];
}

// ============================================
// Tracer Instance
// ============================================

const tracer = trace.getTracer('seizn-genai', '1.0.0');

// ============================================
// Content Hashing (Privacy-Safe)
// ============================================

/**
 * Hash content for privacy-safe capture
 */
function hashContent(content: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
  return crypto.createHash(algorithm).update(content).digest('hex').slice(0, 16);
}

/**
 * Capture content based on policy
 */
function captureContent(
  content: string,
  capture: GenAIContentCapture
): string | undefined {
  switch (capture.mode) {
    case 'off':
      return undefined;
    case 'hash':
      return `hash:${hashContent(content, capture.hashAlgorithm)}`;
    case 'full':
      return content;
    default:
      return undefined;
  }
}

// ============================================
// Span Creation Helpers
// ============================================

/**
 * Create a GenAI span for LLM operations
 */
export function createGenAISpan(
  operationName: string,
  request: GenAIRequestAttributes,
  seiznContext?: SeizContextAttributes,
  contentCapture: GenAIContentCapture = { mode: 'hash' }
): Span {
  const span = tracer.startSpan(operationName, {
    kind: SpanKind.CLIENT,
    attributes: {
      [GenAIAttributes.GEN_AI_SYSTEM]: request.system,
      [GenAIAttributes.GEN_AI_REQUEST_MODEL]: request.model,
      ...(request.maxTokens && {
        [GenAIAttributes.GEN_AI_REQUEST_MAX_TOKENS]: request.maxTokens,
      }),
      ...(request.temperature !== undefined && {
        [GenAIAttributes.GEN_AI_REQUEST_TEMPERATURE]: request.temperature,
      }),
      ...(request.topP !== undefined && {
        [GenAIAttributes.GEN_AI_REQUEST_TOP_P]: request.topP,
      }),
      ...(request.topK !== undefined && {
        [GenAIAttributes.GEN_AI_REQUEST_TOP_K]: request.topK,
      }),
      ...(request.frequencyPenalty !== undefined && {
        [GenAIAttributes.GEN_AI_REQUEST_FREQUENCY_PENALTY]: request.frequencyPenalty,
      }),
      ...(request.presencePenalty !== undefined && {
        [GenAIAttributes.GEN_AI_REQUEST_PRESENCE_PENALTY]: request.presencePenalty,
      }),

      // Seizn context
      ...(seiznContext?.organizationId && {
        [GenAIAttributes.SEIZN_ORGANIZATION_ID]: seiznContext.organizationId,
      }),
      ...(seiznContext?.userId && {
        [GenAIAttributes.SEIZN_USER_ID]: seiznContext.userId,
      }),
      ...(seiznContext?.conversationId && {
        [GenAIAttributes.SEIZN_CONVERSATION_ID]: seiznContext.conversationId,
      }),
      ...(seiznContext?.memoryId && {
        [GenAIAttributes.SEIZN_MEMORY_ID]: seiznContext.memoryId,
      }),
      ...(seiznContext?.guardEnabled !== undefined && {
        [GenAIAttributes.SEIZN_GUARD_ENABLED]: seiznContext.guardEnabled,
      }),
      ...(seiznContext?.policyApplied && {
        [GenAIAttributes.SEIZN_POLICY_APPLIED]: seiznContext.policyApplied.join(','),
      }),
    },
  });

  return span;
}

/**
 * Record GenAI response on span
 */
export function recordGenAIResponse(
  span: Span,
  response: GenAIResponseAttributes,
  content?: string,
  contentCapture: GenAIContentCapture = { mode: 'hash' }
): void {
  if (response.id) {
    span.setAttribute(GenAIAttributes.GEN_AI_RESPONSE_ID, response.id);
  }
  if (response.model) {
    span.setAttribute(GenAIAttributes.GEN_AI_RESPONSE_MODEL, response.model);
  }
  if (response.finishReasons) {
    span.setAttribute(
      GenAIAttributes.GEN_AI_RESPONSE_FINISH_REASONS,
      response.finishReasons.join(',')
    );
  }
  if (response.inputTokens !== undefined) {
    span.setAttribute(GenAIAttributes.GEN_AI_USAGE_INPUT_TOKENS, response.inputTokens);
  }
  if (response.outputTokens !== undefined) {
    span.setAttribute(GenAIAttributes.GEN_AI_USAGE_OUTPUT_TOKENS, response.outputTokens);
  }

  // Capture completion content based on policy
  if (content) {
    const captured = captureContent(content, contentCapture);
    if (captured) {
      span.setAttribute(GenAIAttributes.GEN_AI_COMPLETION, captured);
    }
  }
}

/**
 * Record prompt content on span (privacy-safe)
 */
export function recordPrompt(
  span: Span,
  prompt: string,
  contentCapture: GenAIContentCapture = { mode: 'hash' }
): void {
  const captured = captureContent(prompt, contentCapture);
  if (captured) {
    span.setAttribute(GenAIAttributes.GEN_AI_PROMPT, captured);
  }
}

/**
 * Record tool call on span
 */
export function recordToolCall(
  span: Span,
  toolName: string,
  toolCallId: string
): void {
  span.setAttribute(GenAIAttributes.GEN_AI_TOOL_NAME, toolName);
  span.setAttribute(GenAIAttributes.GEN_AI_TOOL_CALL_ID, toolCallId);
}

/**
 * End span with error
 */
export function endSpanWithError(span: Span, error: Error): void {
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  span.recordException(error);
  span.end();
}

/**
 * End span successfully
 */
export function endSpanSuccess(span: Span): void {
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

// ============================================
// High-Level Instrumentation
// ============================================

/**
 * Instrument an LLM call with full OTEL GenAI semconv
 */
export async function instrumentLLMCall<T>(
  operationName: string,
  request: GenAIRequestAttributes,
  fn: (span: Span) => Promise<T>,
  options?: {
    seiznContext?: SeizContextAttributes;
    contentCapture?: GenAIContentCapture;
    prompt?: string;
  }
): Promise<T> {
  const contentCapture = options?.contentCapture ?? { mode: 'hash' };

  const span = createGenAISpan(
    operationName,
    request,
    options?.seiznContext,
    contentCapture
  );

  // Record prompt if provided
  if (options?.prompt) {
    recordPrompt(span, options.prompt, contentCapture);
  }

  try {
    const result = await context.with(trace.setSpan(context.active(), span), () =>
      fn(span)
    );
    endSpanSuccess(span);
    return result;
  } catch (error) {
    endSpanWithError(span, error as Error);
    throw error;
  }
}

// ============================================
// OTEL Exporter Configuration Template
// ============================================

/**
 * Configuration template for OTEL Collector
 * Export this to help users configure their collector
 */
export const OTEL_COLLECTOR_CONFIG_TEMPLATE = `
# OpenTelemetry Collector Configuration for Seizn GenAI Traces
# Save as: otel-collector-config.yaml

receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 1s
    send_batch_size: 1024

  # Filter sensitive attributes if needed
  attributes:
    actions:
      - key: gen_ai.prompt
        action: hash
        hash_algorithm: sha256
      - key: gen_ai.completion
        action: hash
        hash_algorithm: sha256

exporters:
  # Configure your backend here
  otlp:
    endpoint: "your-backend:4317"
    tls:
      insecure: false

  # Or use logging for debugging
  logging:
    loglevel: debug

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [otlp]
`;
