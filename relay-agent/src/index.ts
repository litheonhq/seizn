/**
 * Seizn Relay Agent
 *
 * Edge federated agent for on-premises vector search.
 * Runs in customer VPC, performs local vector search,
 * and sends only results (IDs, scores, snippets) to Seizn cloud.
 */

import pino from 'pino';
import { getConfig, getVectorConfig, validateConfig } from './config.js';
import { createVectorStore } from './vector-search.js';
import { createServer } from './server.js';
import { signCallbackRequest } from './auth.js';
import type { RelayProtocolResponse, HealthResult } from './types.js';

// Initialize logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

// Track start time for uptime calculation
const startTime = Date.now();

/**
 * Main entry point
 */
async function main(): Promise<void> {
  logger.info('Starting Seizn Relay Agent...');

  // Load and validate configuration
  const config = getConfig();
  const vectorConfig = getVectorConfig();
  validateConfig(config, vectorConfig);

  logger.info({ collections: config.collections }, 'Configuration loaded');

  // Create and connect vector store
  const vectorStore = createVectorStore(vectorConfig);

  try {
    await vectorStore.connect();
    logger.info('Connected to vector database');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to vector database');
    process.exit(1);
  }

  // Create HTTP server
  const app = createServer({
    config,
    vectorStore,
    logger,
    startTime,
  });

  // Start server if direct mode is enabled
  if (config.directMode) {
    app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Relay agent listening (direct mode)');
    });
  }

  // Start heartbeat loop
  startHeartbeat(config, vectorStore);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await vectorStore.disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await vectorStore.disconnect();
    process.exit(0);
  });

  logger.info('Seizn Relay Agent started successfully');
}

/**
 * Send periodic heartbeats to Seizn cloud
 */
function startHeartbeat(
  config: ReturnType<typeof getConfig>,
  vectorStore: ReturnType<typeof createVectorStore>
): void {
  const sendHeartbeat = async (): Promise<void> => {
    try {
      const response = await fetch(`${config.seiznCallbackUrl.replace('/callback', '/health')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Relay-Agent-Key': config.agentKey,
        },
        body: JSON.stringify({
          agentKey: config.agentKey,
          version: '1.0.0',
          capabilities: ['retrieve', 'health', 'capabilities'],
          collections: config.collections,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        logger.debug({ status: data.status }, 'Heartbeat sent');

        // Check for pending requests
        if (data.instructions?.pendingRequests > 0) {
          logger.info({ pending: data.instructions.pendingRequests }, 'Pending requests to process');
          await processPendingRequests(config, vectorStore);
        }
      } else {
        logger.warn({ status: response.status }, 'Heartbeat failed');
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to send heartbeat');
    }
  };

  // Send initial heartbeat
  sendHeartbeat();

  // Set up interval
  setInterval(sendHeartbeat, config.heartbeatIntervalMs);
}

/**
 * Process pending callback requests
 */
async function processPendingRequests(
  config: ReturnType<typeof getConfig>,
  vectorStore: ReturnType<typeof createVectorStore>
): Promise<void> {
  // In a production implementation, this would:
  // 1. Fetch pending requests from Seizn cloud
  // 2. Process each request locally
  // 3. Send results back via callback

  // For now, this is a placeholder
  logger.debug('Checking for pending requests...');

  // Example callback implementation:
  // const pendingResponse = await fetch(`${config.seiznCallbackUrl}/pending?agentKey=${config.agentKey}`);
  // const pending = await pendingResponse.json();
  //
  // for (const request of pending.requests) {
  //   const result = await processRequest(request, vectorStore);
  //   await sendCallback(config, request.requestId, result);
  // }
}

/**
 * Send a callback to Seizn cloud
 */
async function sendCallback(
  config: ReturnType<typeof getConfig>,
  requestId: string,
  response: RelayProtocolResponse
): Promise<void> {
  const signature = signCallbackRequest(requestId, config.agentKey, response);

  try {
    const callbackResponse = await fetch(config.seiznCallbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requestId,
        agentKey: config.agentKey,
        response,
        signature,
      }),
    });

    if (!callbackResponse.ok) {
      logger.error(
        { requestId, status: callbackResponse.status },
        'Callback failed'
      );
    }
  } catch (error) {
    logger.error({ requestId, error }, 'Failed to send callback');
  }
}

// Run main
main().catch((error) => {
  logger.fatal({ error }, 'Fatal error');
  process.exit(1);
});
