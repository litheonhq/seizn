/**
 * Base Connector
 *
 * Abstract base class for all vector database connectors
 */

import type {
  VectorConnector,
  VectorDocument,
  SearchOptions,
  SearchResult,
  ConnectorConfig,
} from './types';

export abstract class BaseConnector implements VectorConnector {
  protected config: ConnectorConfig;
  protected connected: boolean = false;

  constructor(config: ConnectorConfig) {
    this.config = config;
  }

  get name(): string {
    return this.config.name;
  }

  get type(): string {
    return this.config.type;
  }

  get priority(): number {
    return this.config.priority;
  }

  get weight(): number {
    return this.config.weight;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract search(options: SearchOptions): Promise<SearchResult>;
  abstract upsert(documents: VectorDocument[]): Promise<{ count: number }>;
  abstract delete(ids: string[]): Promise<{ count: number }>;
  abstract healthCheck(): Promise<{ healthy: boolean; latency_ms: number }>;

  protected validateConnected(): void {
    if (!this.connected) {
      throw new Error(`Connector ${this.name} is not connected`);
    }
  }

  protected measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latency_ms: number }> {
    const start = performance.now();
    return fn().then((result) => ({
      result,
      latency_ms: Math.round(performance.now() - start),
    }));
  }

  protected normalizeScore(score: number, source: 'cosine' | 'dotproduct' | 'euclidean'): number {
    // Normalize different similarity metrics to 0-1 range
    switch (source) {
      case 'cosine':
        // Cosine similarity is already -1 to 1, map to 0-1
        return (score + 1) / 2;
      case 'dotproduct':
        // Dot product can be any value, use sigmoid
        return 1 / (1 + Math.exp(-score));
      case 'euclidean':
        // Euclidean distance: lower is better, use inverse
        return 1 / (1 + score);
      default:
        return score;
    }
  }
}
