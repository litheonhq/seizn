/**
 * Gateway Adapters Index
 *
 * Central export for all vector database adapters.
 * Includes adapter registry for dynamic adapter creation.
 */

import type {
  VectorDBProvider,
  VectorAdapter,
  GatewayConfig,
  AdapterFactory,
  AdapterRegistry,
} from '../types';
import { BaseVectorAdapter, AdapterError } from './base';
import { PineconeAdapter } from './pinecone';
import { WeaviateAdapter } from './weaviate';
import { PgvectorAdapter } from './pgvector';
import { QdrantAdapter } from './qdrant';

// Export all adapters
export { BaseVectorAdapter, AdapterError } from './base';
export { PineconeAdapter } from './pinecone';
export { WeaviateAdapter } from './weaviate';
export { PgvectorAdapter } from './pgvector';
export { QdrantAdapter } from './qdrant';

/**
 * Default adapter factories
 */
const defaultFactories: Record<VectorDBProvider, AdapterFactory> = {
  pinecone: (config) => new PineconeAdapter(config),
  weaviate: (config) => new WeaviateAdapter(config),
  pgvector: (config) => new PgvectorAdapter(config),
  qdrant: (config) => new QdrantAdapter(config),
};

/**
 * Adapter Registry Implementation
 *
 * Manages adapter factories and creates adapter instances.
 */
class AdapterRegistryImpl implements AdapterRegistry {
  private factories: Map<VectorDBProvider, AdapterFactory>;

  constructor() {
    this.factories = new Map(Object.entries(defaultFactories) as [VectorDBProvider, AdapterFactory][]);
  }

  /**
   * Register a custom adapter factory
   */
  register(provider: VectorDBProvider, factory: AdapterFactory): void {
    this.factories.set(provider, factory);
  }

  /**
   * Create an adapter instance for the given config
   */
  create(config: GatewayConfig): VectorAdapter {
    const factory = this.factories.get(config.provider);

    if (!factory) {
      throw new AdapterError(
        'UNSUPPORTED_PROVIDER',
        `No adapter registered for provider: ${config.provider}`,
        false
      );
    }

    return factory(config);
  }

  /**
   * Check if a provider is registered
   */
  has(provider: VectorDBProvider): boolean {
    return this.factories.has(provider);
  }

  /**
   * Get list of registered providers
   */
  getProviders(): VectorDBProvider[] {
    return Array.from(this.factories.keys());
  }
}

// Singleton registry instance
export const adapterRegistry = new AdapterRegistryImpl();

/**
 * Create an adapter for the given configuration
 *
 * Convenience function that uses the default registry.
 */
export function createAdapter(config: GatewayConfig): VectorAdapter {
  return adapterRegistry.create(config);
}

/**
 * Register a custom adapter factory
 *
 * Allows extending the gateway with custom providers.
 */
export function registerAdapter(provider: VectorDBProvider, factory: AdapterFactory): void {
  adapterRegistry.register(provider, factory);
}

/**
 * Get all supported providers
 */
export function getSupportedProviders(): VectorDBProvider[] {
  return adapterRegistry.getProviders();
}
