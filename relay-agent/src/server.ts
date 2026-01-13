/**
 * Seizn Relay Agent - HTTP Server
 *
 * Express server for handling requests from Seizn cloud (direct mode)
 * or for health checks.
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import type {
  RelayAgentConfig,
  RelayProtocolRequest,
  RelayProtocolResponse,
  RetrievePayload,
  HealthPayload,
  RetrieveResult,
  HealthResult,
  CapabilitiesResult,
  RelayError,
  VectorStore,
  RELAY_PROTOCOL_VERSION,
} from './types.js';
import { verifyRequestSignature } from './auth.js';
import { truncateToSnippet } from './vector-search.js';
import type { Logger } from 'pino';

export interface ServerDependencies {
  config: RelayAgentConfig;
  vectorStore: VectorStore;
  logger: Logger;
  startTime: number;
}

/**
 * Create and configure the Express server
 */
export function createServer(deps: ServerDependencies): express.Application {
  const { config, vectorStore, logger, startTime } = deps;
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Health check endpoint (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    const healthy = vectorStore.isConnected();
    res.status(healthy ? 200 : 503).json({
      healthy,
      version: '1.0.0',
      uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  // Main relay endpoint (requires signature verification)
  app.post('/', async (req: Request, res: Response) => {
    const requestStartTime = Date.now();

    try {
      const request = req.body as RelayProtocolRequest;

      // Validate protocol version
      if (request.version !== '1.0') {
        return res.status(400).json(
          createErrorResponse(
            request.requestId || 'unknown',
            {
              code: 'INVALID_REQUEST',
              message: `Unsupported protocol version: ${request.version}`,
              retryable: false,
            },
            Date.now() - requestStartTime
          )
        );
      }

      // Verify signature
      if (!verifyRequestSignature(request, config.agentKey)) {
        return res.status(401).json(
          createErrorResponse(
            request.requestId,
            {
              code: 'AUTHENTICATION_FAILED',
              message: 'Invalid request signature',
              retryable: false,
            },
            Date.now() - requestStartTime
          )
        );
      }

      // Handle action
      let response: RelayProtocolResponse;

      switch (request.action) {
        case 'retrieve':
          response = await handleRetrieve(
            request.requestId,
            request.payload as RetrievePayload,
            vectorStore,
            config,
            requestStartTime
          );
          break;

        case 'health':
          response = await handleHealth(
            request.requestId,
            request.payload as HealthPayload,
            vectorStore,
            startTime,
            requestStartTime
          );
          break;

        case 'capabilities':
          response = handleCapabilities(
            request.requestId,
            config,
            requestStartTime
          );
          break;

        default:
          response = createErrorResponse(
            request.requestId,
            {
              code: 'INVALID_REQUEST',
              message: `Unknown action: ${request.action}`,
              retryable: false,
            },
            Date.now() - requestStartTime
          );
      }

      logger.info(
        {
          requestId: request.requestId,
          action: request.action,
          status: response.status,
          latencyMs: response.latencyMs,
        },
        'Request completed'
      );

      return res.json(response);
    } catch (error) {
      logger.error({ error }, 'Request handler error');
      return res.status(500).json(
        createErrorResponse(
          'unknown',
          {
            code: 'INTERNAL_ERROR',
            message: error instanceof Error ? error.message : 'Internal error',
            retryable: true,
          },
          Date.now() - requestStartTime
        )
      );
    }
  });

  return app;
}

/**
 * Handle retrieve action
 */
async function handleRetrieve(
  requestId: string,
  payload: RetrievePayload,
  vectorStore: VectorStore,
  config: RelayAgentConfig,
  startTime: number
): Promise<RelayProtocolResponse> {
  if (!payload.query && !payload.queryEmbedding) {
    return createErrorResponse(
      requestId,
      {
        code: 'INVALID_REQUEST',
        message: 'Either query or queryEmbedding is required',
        retryable: false,
      },
      Date.now() - startTime
    );
  }

  const collectionId = payload.collectionId || config.collections[0];
  if (!collectionId) {
    return createErrorResponse(
      requestId,
      {
        code: 'COLLECTION_NOT_FOUND',
        message: 'No collection specified and no default configured',
        retryable: false,
      },
      Date.now() - startTime
    );
  }

  // Check if we serve this collection
  if (!config.collections.includes(collectionId)) {
    return createErrorResponse(
      requestId,
      {
        code: 'COLLECTION_NOT_FOUND',
        message: `This relay does not serve collection: ${collectionId}`,
        retryable: false,
      },
      Date.now() - startTime
    );
  }

  try {
    // Perform vector search
    // In production, you might need to embed the query if only text is provided
    const queryEmbedding = payload.queryEmbedding || [];

    const searchResults = await vectorStore.search({
      collectionId,
      queryEmbedding,
      topK: payload.topK || 10,
      filters: payload.filters,
    });

    // Convert to relay format (only send snippets, not full content)
    const results = searchResults.map((result) => ({
      chunkId: result.id,
      documentId: result.documentId,
      score: result.score,
      snippet: payload.includeContent !== false
        ? truncateToSnippet(result.text, payload.maxSnippetLength || 500)
        : undefined,
      metadata: result.metadata,
    }));

    const retrieveResult: RetrieveResult = {
      results,
      totalFound: results.length,
      collectionId,
    };

    return createSuccessResponse(requestId, retrieveResult, Date.now() - startTime);
  } catch (error) {
    return createErrorResponse(
      requestId,
      {
        code: 'VECTOR_DB_ERROR',
        message: error instanceof Error ? error.message : 'Vector search failed',
        retryable: true,
      },
      Date.now() - startTime
    );
  }
}

/**
 * Handle health action
 */
async function handleHealth(
  requestId: string,
  payload: HealthPayload | undefined,
  vectorStore: VectorStore,
  agentStartTime: number,
  requestStartTime: number
): Promise<RelayProtocolResponse> {
  const uptimeSeconds = Math.floor((Date.now() - agentStartTime) / 1000);
  const isConnected = vectorStore.isConnected();

  const healthResult: HealthResult = {
    healthy: isConnected,
    version: '1.0.0',
    uptimeSeconds,
    collections: await vectorStore.listCollections(),
    vectorDbStatus: isConnected ? 'connected' : 'disconnected',
  };

  if (payload?.detailed) {
    const memUsage = process.memoryUsage();
    const vectorInfo = await vectorStore.getInfo();

    healthResult.diagnostics = {
      memoryUsageMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      cpuUsagePercent: 0, // Would need OS-specific implementation
      activeConnections: 0,
      pendingRequests: 0,
      vectorDb: vectorInfo,
    };
  }

  return createSuccessResponse(requestId, healthResult, Date.now() - requestStartTime);
}

/**
 * Handle capabilities action
 */
function handleCapabilities(
  requestId: string,
  config: RelayAgentConfig,
  startTime: number
): RelayProtocolResponse {
  const capabilitiesResult: CapabilitiesResult = {
    actions: ['retrieve', 'health', 'capabilities'],
    embeddingDimensions: [1024, 1536, 3072], // Common dimensions
    supportedFilters: ['metadata.*', 'collection_id'],
    maxBatchSize: 100,
    maxTopK: 100,
    vectorDbType: 'pgvector', // Would come from config
    metadata: {
      collections: config.collections,
      directMode: config.directMode,
    },
  };

  return createSuccessResponse(requestId, capabilitiesResult, Date.now() - startTime);
}

/**
 * Create a success response
 */
function createSuccessResponse(
  requestId: string,
  payload: RetrieveResult | HealthResult | CapabilitiesResult,
  latencyMs: number
): RelayProtocolResponse {
  return {
    version: '1.0' as typeof RELAY_PROTOCOL_VERSION,
    requestId,
    status: 'success',
    payload,
    latencyMs,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error response
 */
function createErrorResponse(
  requestId: string,
  error: RelayError,
  latencyMs: number
): RelayProtocolResponse {
  return {
    version: '1.0' as typeof RELAY_PROTOCOL_VERSION,
    requestId,
    status: 'error',
    error,
    latencyMs,
    timestamp: new Date().toISOString(),
  };
}
