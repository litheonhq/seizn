/**
 * Vector Store Factory
 *
 * Factory pattern for creating vector store instances based on configuration.
 * Supports environment variable-based configuration for BYO stores.
 */

import type {
  VectorStore,
  VectorStoreConfig,
  VectorStoreProvider,
  PineconeStoreConfig,
  WeaviateStoreConfig,
  QdrantStoreConfig,
} from './types';
import { VectorStoreError } from './types';
import { PineconeStore } from './pinecone';
import { WeaviateStore } from './weaviate';
import { QdrantStore } from './qdrant';

// ============================================================================
// Factory Interface
// ============================================================================

export interface StoreFactoryOptions {
  /** Auto-connect after creation (default: true) */
  autoConnect?: boolean;
  /** Override provider name */
  name?: string;
  /** Debug mode */
  debug?: boolean;
}

// ============================================================================
// Environment Variable Mapping
// ============================================================================

/**
 * Environment variable names for each provider
 */
export const ENV_KEYS = {
  // Provider selection
  VECTOR_STORE_PROVIDER: 'VECTOR_STORE_PROVIDER',

  // Pinecone
  PINECONE_API_KEY: 'PINECONE_API_KEY',
  PINECONE_HOST: 'PINECONE_HOST',
  PINECONE_NAMESPACE: 'PINECONE_NAMESPACE',

  // Weaviate
  WEAVIATE_HOST: 'WEAVIATE_HOST',
  WEAVIATE_API_KEY: 'WEAVIATE_API_KEY',
  WEAVIATE_SCHEME: 'WEAVIATE_SCHEME',
  WEAVIATE_CLASS_NAME: 'WEAVIATE_CLASS_NAME',
  WEAVIATE_TENANT: 'WEAVIATE_TENANT',

  // Qdrant
  QDRANT_URL: 'QDRANT_URL',
  QDRANT_API_KEY: 'QDRANT_API_KEY',
  QDRANT_COLLECTION_NAME: 'QDRANT_COLLECTION_NAME',
} as const;

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a vector store from explicit configuration
 */
export function createStore(
  config: VectorStoreConfig,
  options?: StoreFactoryOptions
): VectorStore {
  const storeConfig = {
    ...config,
    name: options?.name || config.name,
    debug: options?.debug ?? config.debug,
  };

  switch (config.provider) {
    case 'pinecone':
      return new PineconeStore(storeConfig as PineconeStoreConfig);
    case 'weaviate':
      return new WeaviateStore(storeConfig as WeaviateStoreConfig);
    case 'qdrant':
      return new QdrantStore(storeConfig as QdrantStoreConfig);
    case 'supabase':
      throw new VectorStoreError(
        'Supabase store not implemented in BYO module. Use built-in Supabase integration.',
        'INTERNAL_ERROR',
        'supabase'
      );
    case 'custom':
      throw new VectorStoreError(
        'Custom store requires manual implementation',
        'INTERNAL_ERROR',
        'custom'
      );
    default:
      throw new VectorStoreError(
        `Unknown vector store provider: ${(config as VectorStoreConfig).provider}`,
        'INTERNAL_ERROR',
        'custom'
      );
  }
}

/**
 * Create a vector store from environment variables
 */
export function createStoreFromEnv(
  options?: StoreFactoryOptions
): VectorStore {
  const provider = getEnv(ENV_KEYS.VECTOR_STORE_PROVIDER) as VectorStoreProvider | undefined;

  if (!provider) {
    throw new VectorStoreError(
      `Environment variable ${ENV_KEYS.VECTOR_STORE_PROVIDER} is not set. ` +
      `Set it to one of: pinecone, weaviate, qdrant`,
      'INTERNAL_ERROR',
      'custom'
    );
  }

  const config = buildConfigFromEnv(provider, options);
  return createStore(config, options);
}

/**
 * Create and connect a vector store
 */
export async function createConnectedStore(
  config: VectorStoreConfig,
  options?: StoreFactoryOptions
): Promise<VectorStore> {
  const store = createStore(config, options);

  if (options?.autoConnect !== false) {
    await store.connect();
  }

  return store;
}

/**
 * Create and connect a vector store from environment variables
 */
export async function createConnectedStoreFromEnv(
  options?: StoreFactoryOptions
): Promise<VectorStore> {
  const store = createStoreFromEnv(options);

  if (options?.autoConnect !== false) {
    await store.connect();
  }

  return store;
}

// ============================================================================
// Configuration Builders
// ============================================================================

/**
 * Build configuration from environment variables
 */
function buildConfigFromEnv(
  provider: VectorStoreProvider,
  options?: StoreFactoryOptions
): VectorStoreConfig {
  switch (provider) {
    case 'pinecone':
      return buildPineconeConfigFromEnv(options);
    case 'weaviate':
      return buildWeaviateConfigFromEnv(options);
    case 'qdrant':
      return buildQdrantConfigFromEnv(options);
    default:
      throw new VectorStoreError(
        `Provider "${provider}" is not supported for environment variable configuration`,
        'INTERNAL_ERROR',
        provider
      );
  }
}

function buildPineconeConfigFromEnv(options?: StoreFactoryOptions): PineconeStoreConfig {
  const apiKey = requireEnv(ENV_KEYS.PINECONE_API_KEY);
  const host = requireEnv(ENV_KEYS.PINECONE_HOST);

  return {
    provider: 'pinecone',
    name: options?.name || 'pinecone',
    debug: options?.debug,
    apiKey,
    host,
    namespace: getEnv(ENV_KEYS.PINECONE_NAMESPACE),
  };
}

function buildWeaviateConfigFromEnv(options?: StoreFactoryOptions): WeaviateStoreConfig {
  const host = requireEnv(ENV_KEYS.WEAVIATE_HOST);
  const className = requireEnv(ENV_KEYS.WEAVIATE_CLASS_NAME);
  const schemeEnv = getEnv(ENV_KEYS.WEAVIATE_SCHEME);

  return {
    provider: 'weaviate',
    name: options?.name || 'weaviate',
    debug: options?.debug,
    host,
    className,
    apiKey: getEnv(ENV_KEYS.WEAVIATE_API_KEY),
    scheme: (schemeEnv === 'http' ? 'http' : 'https') as 'http' | 'https',
    tenant: getEnv(ENV_KEYS.WEAVIATE_TENANT),
  };
}

function buildQdrantConfigFromEnv(options?: StoreFactoryOptions): QdrantStoreConfig {
  const url = requireEnv(ENV_KEYS.QDRANT_URL);
  const collectionName = requireEnv(ENV_KEYS.QDRANT_COLLECTION_NAME);

  return {
    provider: 'qdrant',
    name: options?.name || 'qdrant',
    debug: options?.debug,
    url,
    collectionName,
    apiKey: getEnv(ENV_KEYS.QDRANT_API_KEY),
  };
}

// ============================================================================
// Environment Helpers
// ============================================================================

function getEnv(key: string): string | undefined {
  return process.env[key];
}

function requireEnv(key: string): string {
  const value = getEnv(key);
  if (!value) {
    throw new VectorStoreError(
      `Required environment variable ${key} is not set`,
      'INTERNAL_ERROR',
      'custom'
    );
  }
  return value;
}

// ============================================================================
// Singleton Management
// ============================================================================

let defaultStore: VectorStore | null = null;

/**
 * Get or create the default store from environment
 * Uses singleton pattern for reuse
 */
export async function getDefaultStore(
  options?: StoreFactoryOptions
): Promise<VectorStore> {
  if (!defaultStore) {
    defaultStore = await createConnectedStoreFromEnv(options);
  }
  return defaultStore;
}

/**
 * Reset the default store (for testing or reconfiguration)
 */
export async function resetDefaultStore(): Promise<void> {
  if (defaultStore) {
    await defaultStore.disconnect();
    defaultStore = null;
  }
}

/**
 * Check if environment is configured for BYO store
 */
export function isBYOStoreConfigured(): boolean {
  const provider = getEnv(ENV_KEYS.VECTOR_STORE_PROVIDER);
  if (!provider) return false;

  switch (provider) {
    case 'pinecone':
      return !!getEnv(ENV_KEYS.PINECONE_API_KEY) && !!getEnv(ENV_KEYS.PINECONE_HOST);
    case 'weaviate':
      return !!getEnv(ENV_KEYS.WEAVIATE_HOST) && !!getEnv(ENV_KEYS.WEAVIATE_CLASS_NAME);
    case 'qdrant':
      return !!getEnv(ENV_KEYS.QDRANT_URL) && !!getEnv(ENV_KEYS.QDRANT_COLLECTION_NAME);
    default:
      return false;
  }
}

/**
 * Get the configured provider name
 */
export function getConfiguredProvider(): VectorStoreProvider | null {
  const provider = getEnv(ENV_KEYS.VECTOR_STORE_PROVIDER);
  if (!provider) return null;

  if (['pinecone', 'weaviate', 'qdrant', 'supabase', 'custom'].includes(provider)) {
    return provider as VectorStoreProvider;
  }
  return null;
}
