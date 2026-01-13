/**
 * Seizn Relay Agent - Configuration
 */

import dotenv from 'dotenv';
import type { RelayAgentConfig, VectorSearchConfig } from './types.js';

// Load environment variables
dotenv.config();

/**
 * Get relay agent configuration from environment variables
 */
export function getConfig(): RelayAgentConfig {
  const agentKey = process.env.SEIZN_RELAY_AGENT_KEY;
  if (!agentKey) {
    throw new Error('SEIZN_RELAY_AGENT_KEY is required');
  }

  const seiznCallbackUrl = process.env.SEIZN_CALLBACK_URL || 'https://seizn.com/api/relay/callback';
  const collections = (process.env.SEIZN_RELAY_COLLECTIONS || '').split(',').filter(Boolean);

  return {
    seiznCallbackUrl,
    agentKey,
    collections,
    port: parseInt(process.env.PORT || '3001', 10),
    directMode: process.env.SEIZN_RELAY_DIRECT_MODE === 'true',
    heartbeatIntervalMs: parseInt(process.env.SEIZN_RELAY_HEARTBEAT_INTERVAL || '30000', 10),
    logLevel: (process.env.LOG_LEVEL || 'info') as RelayAgentConfig['logLevel'],
  };
}

/**
 * Get vector search configuration from environment variables
 */
export function getVectorConfig(): VectorSearchConfig {
  const type = (process.env.VECTOR_DB_TYPE || 'pgvector') as VectorSearchConfig['type'];

  return {
    type,
    connectionString: process.env.VECTOR_DB_CONNECTION_STRING,
    host: process.env.VECTOR_DB_HOST,
    port: process.env.VECTOR_DB_PORT ? parseInt(process.env.VECTOR_DB_PORT, 10) : undefined,
    apiKey: process.env.VECTOR_DB_API_KEY,
    defaultCollection: process.env.VECTOR_DB_DEFAULT_COLLECTION || 'default',
    dimensions: parseInt(process.env.VECTOR_DB_DIMENSIONS || '1024', 10),
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: RelayAgentConfig, vectorConfig: VectorSearchConfig): void {
  if (!config.agentKey.startsWith('szn_relay_')) {
    throw new Error('Invalid agent key format. Should start with szn_relay_');
  }

  if (config.collections.length === 0) {
    console.warn('No collections configured. The relay will not serve any searches.');
  }

  if (config.directMode && !config.port) {
    throw new Error('Port is required for direct mode');
  }

  if (!vectorConfig.connectionString && !vectorConfig.host) {
    throw new Error('Either VECTOR_DB_CONNECTION_STRING or VECTOR_DB_HOST is required');
  }

  const supportedTypes = ['pgvector', 'qdrant', 'pinecone', 'weaviate', 'milvus', 'chroma'];
  if (!supportedTypes.includes(vectorConfig.type)) {
    throw new Error(`Unsupported vector database type: ${vectorConfig.type}`);
  }
}
