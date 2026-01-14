/**
 * Gateway Proxy API Endpoint
 *
 * POST /api/gateway/proxy
 *
 * Proxies all VectorDB requests through the gateway.
 * Supports Pinecone, Weaviate, pgvector, and Qdrant.
 *
 * @example
 * ```typescript
 * // Search request
 * const response = await fetch('/api/gateway/proxy', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     operation: 'search',
 *     provider: 'pinecone',
 *     config: {
 *       apiKey: 'your-api-key',
 *       host: 'your-index-xxx.svc.pinecone.io',
 *     },
 *     payload: {
 *       type: 'search',
 *       embedding: [0.1, 0.2, ...],
 *       topK: 10,
 *     },
 *   }),
 * });
 * ```
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GatewayProxy,
  TraceInjector,
  type ProxyRequest,
  type VectorDBProvider,
  type GatewayConfig,
} from '@/lib/gateway';

// Create proxy instance
const proxy = new GatewayProxy({
  retries: 2,
  retryDelayMs: 1000,
  timeout: 30000,
});

// Supported operations
const VALID_OPERATIONS = ['search', 'upsert', 'delete', 'health'] as const;

// Supported providers
const VALID_PROVIDERS: VectorDBProvider[] = ['pinecone', 'weaviate', 'pgvector', 'qdrant'];

/**
 * POST /api/gateway/proxy
 *
 * Execute a VectorDB operation through the gateway.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const startTime = performance.now();

  // Extract trace context from headers
  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const trace = TraceInjector.fromHeaders(headers);

  try {
    // Parse request body
    const body = await request.json();

    // Validate request structure
    const validation = validateRequestBody(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: validation.error,
            retryable: false,
          },
          traceId: trace.traceId,
          spanId: trace.spanId,
          latencyMs: Math.round(performance.now() - startTime),
          providerLatencyMs: 0,
          provider: body.provider || 'unknown',
          operation: body.operation || 'unknown',
          timestamp: new Date().toISOString(),
        },
        { status: 400 }
      );
    }

    // Build proxy request
    const proxyRequest: ProxyRequest = {
      operation: body.operation,
      provider: body.provider,
      config: buildConfig(body.provider, body.config),
      payload: body.payload,
    };

    // Execute through proxy
    const response = await proxy.execute(proxyRequest, trace);

    // Return response with appropriate status code
    const statusCode = response.success ? 200 : getErrorStatusCode(response.error?.code);

    return NextResponse.json(response, {
      status: statusCode,
      headers: {
        'X-Trace-Id': response.traceId,
        'X-Span-Id': response.spanId,
        'X-Latency-Ms': String(response.latencyMs),
        'X-Provider-Latency-Ms': String(response.providerLatencyMs),
      },
    });
  } catch (error) {
    // Handle unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    console.error('[Gateway Proxy Error]', {
      traceId: trace.traceId,
      error: errorMessage,
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          retryable: true,
        },
        traceId: trace.traceId,
        spanId: trace.spanId,
        latencyMs: Math.round(performance.now() - startTime),
        providerLatencyMs: 0,
        provider: 'unknown',
        operation: 'unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Validate request body
 */
function validateRequestBody(body: unknown): { valid: boolean; error?: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be a JSON object' };
  }

  const { operation, provider, config, payload } = body as Record<string, unknown>;

  // Validate operation
  if (!operation || typeof operation !== 'string') {
    return { valid: false, error: 'operation is required and must be a string' };
  }

  if (!VALID_OPERATIONS.includes(operation as typeof VALID_OPERATIONS[number])) {
    return {
      valid: false,
      error: `Invalid operation: ${operation}. Must be one of: ${VALID_OPERATIONS.join(', ')}`,
    };
  }

  // Validate provider
  if (!provider || typeof provider !== 'string') {
    return { valid: false, error: 'provider is required and must be a string' };
  }

  if (!VALID_PROVIDERS.includes(provider as VectorDBProvider)) {
    return {
      valid: false,
      error: `Invalid provider: ${provider}. Must be one of: ${VALID_PROVIDERS.join(', ')}`,
    };
  }

  // Validate config
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'config is required and must be an object' };
  }

  // Validate payload
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'payload is required and must be an object' };
  }

  // Provider-specific config validation
  const configValidation = validateProviderConfig(provider as VectorDBProvider, config as Record<string, unknown>);
  if (!configValidation.valid) {
    return configValidation;
  }

  // Operation-specific payload validation
  const payloadValidation = validatePayload(operation as typeof VALID_OPERATIONS[number], payload as Record<string, unknown>);
  if (!payloadValidation.valid) {
    return payloadValidation;
  }

  return { valid: true };
}

/**
 * Validate provider-specific config
 */
function validateProviderConfig(
  provider: VectorDBProvider,
  config: Record<string, unknown>
): { valid: boolean; error?: string } {
  switch (provider) {
    case 'pinecone':
      if (!config.apiKey) {
        return { valid: false, error: 'Pinecone config requires apiKey' };
      }
      if (!config.host && !config.environment) {
        return { valid: false, error: 'Pinecone config requires host or environment' };
      }
      break;

    case 'weaviate':
      if (!config.host) {
        return { valid: false, error: 'Weaviate config requires host' };
      }
      if (!config.className) {
        return { valid: false, error: 'Weaviate config requires className' };
      }
      break;

    case 'pgvector':
      if (!config.connectionString && !config.host) {
        return { valid: false, error: 'pgvector config requires connectionString or host' };
      }
      break;

    case 'qdrant':
      if (!config.host) {
        return { valid: false, error: 'Qdrant config requires host' };
      }
      if (!config.collectionName) {
        return { valid: false, error: 'Qdrant config requires collectionName' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Validate operation-specific payload
 */
function validatePayload(
  operation: typeof VALID_OPERATIONS[number],
  payload: Record<string, unknown>
): { valid: boolean; error?: string } {
  switch (operation) {
    case 'search':
      if (!payload.embedding && !payload.query) {
        return { valid: false, error: 'Search payload requires embedding or query' };
      }
      if (payload.embedding && !Array.isArray(payload.embedding)) {
        return { valid: false, error: 'Search payload embedding must be an array' };
      }
      break;

    case 'upsert':
      if (!payload.vectors || !Array.isArray(payload.vectors)) {
        return { valid: false, error: 'Upsert payload requires vectors array' };
      }
      if (payload.vectors.length === 0) {
        return { valid: false, error: 'Upsert payload vectors cannot be empty' };
      }
      // Validate each vector
      for (const vec of payload.vectors as Array<Record<string, unknown>>) {
        if (!vec.id) {
          return { valid: false, error: 'Each vector must have an id' };
        }
        if (!vec.values || !Array.isArray(vec.values)) {
          return { valid: false, error: 'Each vector must have values array' };
        }
      }
      break;

    case 'delete':
      if (!payload.ids && !payload.deleteAll && !payload.filter) {
        return { valid: false, error: 'Delete payload requires ids, deleteAll, or filter' };
      }
      if (payload.ids && !Array.isArray(payload.ids)) {
        return { valid: false, error: 'Delete payload ids must be an array' };
      }
      break;

    case 'health':
      // No validation needed for health check
      break;
  }

  return { valid: true };
}

/**
 * Build gateway config from request config
 */
function buildConfig(provider: VectorDBProvider, config: Record<string, unknown>): GatewayConfig {
  return {
    provider,
    apiKey: config.apiKey as string | undefined,
    host: config.host as string | undefined,
    environment: config.environment as string | undefined,
    indexName: config.indexName as string | undefined,
    namespace: config.namespace as string | undefined,
    className: config.className as string | undefined,
    collectionName: config.collectionName as string | undefined,
    tableName: config.tableName as string | undefined,
    connectionString: config.connectionString as string | undefined,
    scheme: config.scheme as 'http' | 'https' | undefined,
    port: config.port as number | undefined,
  };
}

/**
 * Get HTTP status code from error code
 */
function getErrorStatusCode(errorCode?: string): number {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
    case 'INVALID_PAYLOAD':
      return 400;

    case 'NOT_CONNECTED':
    case 'CONFIG_ERROR':
      return 400;

    case 'UNSUPPORTED_PROVIDER':
    case 'NOT_IMPLEMENTED':
    case 'NOT_SUPPORTED':
      return 501;

    case 'CONNECTION_FAILED':
      return 502;

    case 'QUERY_FAILED':
    case 'UPSERT_FAILED':
    case 'DELETE_FAILED':
    case 'OPERATION_FAILED':
      return 502;

    case 'INTERNAL_ERROR':
    default:
      return 500;
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, traceparent, baggage',
      'Access-Control-Max-Age': '86400',
    },
  });
}
