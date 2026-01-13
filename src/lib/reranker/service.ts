/**
 * Domain-adaptive Reranker Service
 */

import type {
  RerankerConfig,
  RerankRequest,
  RerankResult,
  RerankDocument,
  RankedDocument,
  DomainType,
  RerankerModel,
} from './types';
import { DOMAIN_CONFIGS, detectDomain, getDefaultThreshold } from './domains';

// Default configuration
const DEFAULT_CONFIG: RerankerConfig = {
  model: 'cohere-rerank-v3',
  domain: 'general',
  threshold: 0.3,
  maxCandidates: 100,
  batchSize: 50,
  includeScores: true,
};

/**
 * Main reranker service
 */
export class RerankerService {
  private config: RerankerConfig;
  private apiKeys: {
    cohere?: string;
    openai?: string;
    custom?: string;
  };

  constructor(
    config: Partial<RerankerConfig> = {},
    apiKeys: { cohere?: string; openai?: string; custom?: string } = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.apiKeys = apiKeys;
  }

  /**
   * Rerank documents for a query
   */
  async rerank(request: RerankRequest): Promise<RerankResult> {
    const start = performance.now();

    // Merge config with request config
    const config = { ...this.config, ...request.config };

    // Auto-detect domain if not specified
    const domain = config.domain || this.detectDomainFromQuery(request.query, request.documents);

    // Apply domain-specific threshold if not overridden
    if (!config.threshold) {
      config.threshold = getDefaultThreshold(domain);
    }

    // Limit candidates
    const candidates = request.documents.slice(0, config.maxCandidates);

    // Rerank based on model
    let rankedDocs: RankedDocument[];
    let tokensUsed: number | undefined;

    switch (config.model) {
      case 'cohere-rerank-v3':
      case 'cohere-rerank-multilingual-v3':
        const cohereResult = await this.rerankWithCohere(
          request.query,
          candidates,
          config.model,
          domain
        );
        rankedDocs = cohereResult.documents;
        tokensUsed = cohereResult.tokensUsed;
        break;

      case 'bge-reranker-base':
      case 'bge-reranker-large':
        rankedDocs = await this.rerankWithBGE(request.query, candidates, config.model);
        break;

      case 'cross-encoder/ms-marco-MiniLM-L-6-v2':
      case 'cross-encoder/ms-marco-TinyBERT-L-2-v2':
        rankedDocs = await this.rerankWithCrossEncoder(request.query, candidates, config.model);
        break;

      case 'custom':
        rankedDocs = await this.rerankWithCustomModel(
          request.query,
          candidates,
          config.customModelId || ''
        );
        break;

      default:
        // Fallback to score-based sorting
        rankedDocs = this.fallbackRerank(candidates);
    }

    // Apply threshold filtering
    const filteredDocs = rankedDocs.filter((doc) => doc.rerankScore >= (config.threshold || 0));

    // Calculate score improvements
    const docsWithImprovement = filteredDocs.map((doc, index) => {
      const originalIndex = candidates.findIndex((c) => c.id === doc.id);
      return {
        ...doc,
        rank: index + 1,
        scoreImprovement: originalIndex >= 0 ? originalIndex - index : 0,
      };
    });

    return {
      documents: docsWithImprovement,
      model: config.model,
      domain,
      latency_ms: Math.round(performance.now() - start),
      tokensUsed,
    };
  }

  /**
   * Detect domain from query and documents
   */
  private detectDomainFromQuery(query: string, documents: RerankDocument[]): DomainType {
    // Combine query and sample documents for detection
    const sampleContent = [query, ...documents.slice(0, 3).map((d) => d.content)].join(' ');
    return detectDomain(sampleContent);
  }

  /**
   * Rerank using Cohere Rerank API
   */
  private async rerankWithCohere(
    query: string,
    documents: RerankDocument[],
    model: string,
    domain: DomainType
  ): Promise<{ documents: RankedDocument[]; tokensUsed: number }> {
    const apiKey = this.apiKeys.cohere || process.env.COHERE_API_KEY;

    if (!apiKey) {
      console.warn('Cohere API key not configured, using fallback reranking');
      return { documents: this.fallbackRerank(documents), tokensUsed: 0 };
    }

    try {
      const response = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model === 'cohere-rerank-multilingual-v3' ? 'rerank-multilingual-v3.0' : 'rerank-english-v3.0',
          query,
          documents: documents.map((d) => d.content),
          top_n: documents.length,
          return_documents: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('Cohere rerank error:', error);
        return { documents: this.fallbackRerank(documents), tokensUsed: 0 };
      }

      const result = (await response.json()) as {
        results: Array<{ index: number; relevance_score: number }>;
        meta?: { billed_units?: { search_units: number } };
      };

      const rankedDocs: RankedDocument[] = result.results.map((r, rank) => ({
        ...documents[r.index],
        rerankScore: r.relevance_score,
        rank: rank + 1,
      }));

      return {
        documents: rankedDocs,
        tokensUsed: result.meta?.billed_units?.search_units || 0,
      };
    } catch (error) {
      console.error('Cohere rerank error:', error);
      return { documents: this.fallbackRerank(documents), tokensUsed: 0 };
    }
  }

  /**
   * Rerank using BGE Reranker (via HuggingFace Inference API)
   */
  private async rerankWithBGE(
    query: string,
    documents: RerankDocument[],
    model: string
  ): Promise<RankedDocument[]> {
    // BGE reranker would typically be called via HuggingFace Inference API
    // For now, use a similarity-based approximation
    const rankedDocs = this.computeSimilarityScores(query, documents);
    return rankedDocs;
  }

  /**
   * Rerank using Cross-Encoder models
   */
  private async rerankWithCrossEncoder(
    query: string,
    documents: RerankDocument[],
    model: string
  ): Promise<RankedDocument[]> {
    // Cross-encoder would be called via HuggingFace Inference API
    // For now, use similarity-based approximation
    const rankedDocs = this.computeSimilarityScores(query, documents);
    return rankedDocs;
  }

  /**
   * Rerank using custom fine-tuned model
   */
  private async rerankWithCustomModel(
    query: string,
    documents: RerankDocument[],
    modelId: string
  ): Promise<RankedDocument[]> {
    // Custom model endpoint would be called here
    // For now, use fallback
    return this.fallbackRerank(documents);
  }

  /**
   * Compute similarity scores for fallback reranking
   */
  private computeSimilarityScores(
    query: string,
    documents: RerankDocument[]
  ): RankedDocument[] {
    const queryTerms = new Set(query.toLowerCase().split(/\s+/));

    const scored = documents.map((doc) => {
      const contentTerms = doc.content.toLowerCase().split(/\s+/);
      const matchCount = contentTerms.filter((t) => queryTerms.has(t)).length;
      const termFrequency = matchCount / Math.max(contentTerms.length, 1);

      // Simple TF-IDF-like score
      const score = Math.min(0.5 + termFrequency * 2, 1);

      return {
        ...doc,
        rerankScore: score,
        rank: 0,
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.rerankScore - a.rerankScore);

    // Assign ranks
    return scored.map((doc, index) => ({
      ...doc,
      rank: index + 1,
    }));
  }

  /**
   * Fallback reranking using original scores
   */
  private fallbackRerank(documents: RerankDocument[]): RankedDocument[] {
    const sorted = [...documents].sort(
      (a, b) => (b.originalScore || 0) - (a.originalScore || 0)
    );

    return sorted.map((doc, index) => ({
      ...doc,
      rerankScore: doc.originalScore || 0.5,
      rank: index + 1,
    }));
  }

  /**
   * Get available models
   */
  static getAvailableModels(): Array<{
    id: RerankerModel;
    name: string;
    provider: string;
    description: string;
  }> {
    return [
      {
        id: 'cohere-rerank-v3',
        name: 'Cohere Rerank v3',
        provider: 'Cohere',
        description: 'High-quality English reranking',
      },
      {
        id: 'cohere-rerank-multilingual-v3',
        name: 'Cohere Rerank Multilingual v3',
        provider: 'Cohere',
        description: 'Multilingual reranking support',
      },
      {
        id: 'bge-reranker-base',
        name: 'BGE Reranker Base',
        provider: 'BAAI',
        description: 'Fast, open-source reranker',
      },
      {
        id: 'bge-reranker-large',
        name: 'BGE Reranker Large',
        provider: 'BAAI',
        description: 'High-quality open-source reranker',
      },
      {
        id: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
        name: 'MS MARCO MiniLM',
        provider: 'Sentence Transformers',
        description: 'Lightweight cross-encoder',
      },
      {
        id: 'cross-encoder/ms-marco-TinyBERT-L-2-v2',
        name: 'MS MARCO TinyBERT',
        provider: 'Sentence Transformers',
        description: 'Ultra-fast cross-encoder',
      },
      {
        id: 'custom',
        name: 'Custom Model',
        provider: 'User',
        description: 'Your fine-tuned model',
      },
    ];
  }

  /**
   * Get domain configurations
   */
  static getDomainConfigs() {
    return DOMAIN_CONFIGS;
  }
}

// Singleton instance
let rerankerInstance: RerankerService | null = null;

export function getRerankerService(config?: Partial<RerankerConfig>): RerankerService {
  if (!rerankerInstance || config) {
    rerankerInstance = new RerankerService(config);
  }
  return rerankerInstance;
}
