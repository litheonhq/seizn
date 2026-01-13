/**
 * Federation Service
 *
 * Combines results from multiple vector database connectors
 */

import type {
  VectorConnector,
  VectorDocument,
  FederatedSearchOptions,
  FederatedSearchResult,
  AnyConnectorConfig,
} from './types';
import { PineconeConnector } from './pinecone';
import { WeaviateConnector } from './weaviate';

export class FederationService {
  private connectors: Map<string, VectorConnector> = new Map();

  /**
   * Register a connector
   */
  async addConnector(config: AnyConnectorConfig): Promise<void> {
    let connector: VectorConnector;

    switch (config.type) {
      case 'pinecone':
        connector = new PineconeConnector(config);
        break;
      case 'weaviate':
        connector = new WeaviateConnector(config);
        break;
      default:
        throw new Error(`Unsupported connector type: ${config.type}`);
    }

    await connector.connect();
    this.connectors.set(config.name, connector);
  }

  /**
   * Remove a connector
   */
  async removeConnector(name: string): Promise<void> {
    const connector = this.connectors.get(name);
    if (connector) {
      await connector.disconnect();
      this.connectors.delete(name);
    }
  }

  /**
   * List all registered connectors
   */
  listConnectors(): { name: string; type: string; enabled: boolean }[] {
    return Array.from(this.connectors.entries()).map(([name, connector]) => ({
      name,
      type: connector.type,
      enabled: true,
    }));
  }

  /**
   * Federated search across all or selected connectors
   */
  async search(options: FederatedSearchOptions): Promise<FederatedSearchResult> {
    const start = performance.now();

    // Filter connectors if specific sources requested
    let targetConnectors = Array.from(this.connectors.entries());
    if (options.sources && options.sources.length > 0) {
      targetConnectors = targetConnectors.filter(([name]) => options.sources!.includes(name));
    }

    if (targetConnectors.length === 0) {
      return {
        documents: [],
        sources: {},
        total_latency_ms: 0,
        merge_strategy: options.mergeStrategy || 'interleave',
      };
    }

    // Execute searches in parallel with timeout
    const timeout = options.timeout_ms || 5000;
    const searchPromises = targetConnectors.map(async ([name, connector]) => {
      try {
        const result = await Promise.race([
          connector.search(options),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          ),
        ]);
        return { name, result };
      } catch (error) {
        return {
          name,
          result: {
            documents: [],
            latency_ms: timeout,
            source: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        };
      }
    });

    const results = await Promise.all(searchPromises);

    // Build sources summary
    const sources: FederatedSearchResult['sources'] = {};
    for (const { name, result } of results) {
      sources[name] = {
        count: result.documents.length,
        latency_ms: result.latency_ms,
        error: result.error,
      };
    }

    // Collect all documents
    const allDocuments = results.flatMap(({ result }) => result.documents);

    // Merge documents based on strategy
    const mergedDocuments = this.mergeDocuments(
      allDocuments,
      options.mergeStrategy || 'interleave',
      options.deduplicateBy
    );

    // Apply topK limit
    const finalDocuments = mergedDocuments.slice(0, options.topK || 10);

    return {
      documents: finalDocuments,
      sources,
      total_latency_ms: Math.round(performance.now() - start),
      merge_strategy: options.mergeStrategy || 'interleave',
    };
  }

  /**
   * Merge documents from multiple sources
   */
  private mergeDocuments(
    documents: VectorDocument[],
    strategy: 'interleave' | 'append' | 'weighted',
    deduplicateBy?: 'id' | 'content' | 'similarity'
  ): VectorDocument[] {
    // First, deduplicate if requested
    let deduped = documents;
    if (deduplicateBy) {
      deduped = this.deduplicateDocuments(documents, deduplicateBy);
    }

    switch (strategy) {
      case 'interleave':
        return this.interleaveBySource(deduped);

      case 'append':
        // Just concatenate, keeping original order
        return deduped;

      case 'weighted':
        // Sort by score (higher first)
        return deduped.sort((a, b) => (b.score || 0) - (a.score || 0));

      default:
        return deduped;
    }
  }

  /**
   * Interleave documents from different sources
   * Takes one from each source in round-robin fashion
   */
  private interleaveBySource(documents: VectorDocument[]): VectorDocument[] {
    // Group by source
    const bySource: Map<string, VectorDocument[]> = new Map();
    for (const doc of documents) {
      const existing = bySource.get(doc.source) || [];
      existing.push(doc);
      bySource.set(doc.source, existing);
    }

    // Sort each source's documents by score
    for (const docs of bySource.values()) {
      docs.sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    // Interleave
    const result: VectorDocument[] = [];
    const sources = Array.from(bySource.keys());
    let index = 0;
    let hasMore = true;

    while (hasMore) {
      hasMore = false;
      for (const source of sources) {
        const docs = bySource.get(source)!;
        if (index < docs.length) {
          result.push(docs[index]);
          hasMore = true;
        }
      }
      index++;
    }

    return result;
  }

  /**
   * Remove duplicate documents
   */
  private deduplicateDocuments(
    documents: VectorDocument[],
    by: 'id' | 'content' | 'similarity'
  ): VectorDocument[] {
    const seen = new Set<string>();
    const result: VectorDocument[] = [];

    for (const doc of documents) {
      let key: string;

      switch (by) {
        case 'id':
          key = doc.id;
          break;
        case 'content':
          // Use first 200 chars of content as key
          key = doc.content.slice(0, 200).toLowerCase().trim();
          break;
        case 'similarity':
          // Use content hash for similarity-based dedup
          key = this.simpleHash(doc.content.toLowerCase().trim());
          break;
        default:
          key = doc.id;
      }

      if (!seen.has(key)) {
        seen.add(key);
        result.push(doc);
      }
    }

    return result;
  }

  /**
   * Simple string hash for deduplication
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  /**
   * Upsert to all or specific connectors
   */
  async upsert(
    documents: VectorDocument[],
    targets?: string[]
  ): Promise<{ [name: string]: { count: number; error?: string } }> {
    let targetConnectors = Array.from(this.connectors.entries());
    if (targets && targets.length > 0) {
      targetConnectors = targetConnectors.filter(([name]) => targets.includes(name));
    }

    const results: { [name: string]: { count: number; error?: string } } = {};

    await Promise.all(
      targetConnectors.map(async ([name, connector]) => {
        try {
          const result = await connector.upsert(documents);
          results[name] = { count: result.count };
        } catch (error) {
          results[name] = {
            count: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return results;
  }

  /**
   * Health check all connectors
   */
  async healthCheck(): Promise<{
    [name: string]: { healthy: boolean; latency_ms: number };
  }> {
    const results: { [name: string]: { healthy: boolean; latency_ms: number } } = {};

    await Promise.all(
      Array.from(this.connectors.entries()).map(async ([name, connector]) => {
        results[name] = await connector.healthCheck();
      })
    );

    return results;
  }

  /**
   * Disconnect all connectors
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.connectors.values()).map((connector) => connector.disconnect())
    );
    this.connectors.clear();
  }
}

// Singleton instance
let federationInstance: FederationService | null = null;

export function getFederationService(): FederationService {
  if (!federationInstance) {
    federationInstance = new FederationService();
  }
  return federationInstance;
}
