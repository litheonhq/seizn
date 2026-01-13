/**
 * Domain Configurations for Adaptive Reranking
 */

import type { DomainConfig, DomainType, RerankerModel } from './types';

export const DOMAIN_CONFIGS: Record<DomainType, DomainConfig> = {
  general: {
    type: 'general',
    name: 'General Purpose',
    description: 'Balanced reranking for general content',
    recommendedModel: 'cohere-rerank-v3',
    defaultThreshold: 0.3,
    specializations: ['web content', 'documentation', 'articles', 'blogs'],
  },
  legal: {
    type: 'legal',
    name: 'Legal & Compliance',
    description: 'Optimized for legal documents, contracts, and regulatory content',
    recommendedModel: 'bge-reranker-large',
    defaultThreshold: 0.4,
    specializations: [
      'contracts',
      'regulations',
      'case law',
      'compliance',
      'policies',
      'legal opinions',
    ],
  },
  medical: {
    type: 'medical',
    name: 'Medical & Healthcare',
    description: 'Specialized for medical literature and clinical content',
    recommendedModel: 'bge-reranker-large',
    defaultThreshold: 0.45,
    specializations: [
      'clinical trials',
      'medical research',
      'patient records',
      'drug information',
      'diagnostic guides',
    ],
  },
  technical: {
    type: 'technical',
    name: 'Technical Documentation',
    description: 'Optimized for code, APIs, and technical docs',
    recommendedModel: 'cohere-rerank-v3',
    defaultThreshold: 0.35,
    specializations: [
      'API documentation',
      'code snippets',
      'technical guides',
      'SDK references',
      'troubleshooting',
    ],
  },
  scientific: {
    type: 'scientific',
    name: 'Scientific Research',
    description: 'Tailored for academic papers and research content',
    recommendedModel: 'bge-reranker-large',
    defaultThreshold: 0.4,
    specializations: [
      'research papers',
      'abstracts',
      'citations',
      'experimental data',
      'peer reviews',
    ],
  },
  financial: {
    type: 'financial',
    name: 'Financial Services',
    description: 'Optimized for financial documents and market data',
    recommendedModel: 'cohere-rerank-v3',
    defaultThreshold: 0.35,
    specializations: [
      'financial reports',
      'market analysis',
      'SEC filings',
      'earnings calls',
      'investment research',
    ],
  },
  ecommerce: {
    type: 'ecommerce',
    name: 'E-commerce & Retail',
    description: 'Product search and catalog optimization',
    recommendedModel: 'cohere-rerank-v3',
    defaultThreshold: 0.25,
    specializations: [
      'product descriptions',
      'reviews',
      'specifications',
      'categories',
      'inventory',
    ],
  },
  custom: {
    type: 'custom',
    name: 'Custom Domain',
    description: 'User-defined domain with custom training',
    recommendedModel: 'custom',
    defaultThreshold: 0.35,
    specializations: [],
  },
};

/**
 * Get recommended model for a domain
 */
export function getRecommendedModel(domain: DomainType): RerankerModel {
  return DOMAIN_CONFIGS[domain]?.recommendedModel || 'cohere-rerank-v3';
}

/**
 * Get default threshold for a domain
 */
export function getDefaultThreshold(domain: DomainType): number {
  return DOMAIN_CONFIGS[domain]?.defaultThreshold || 0.3;
}

/**
 * Detect domain from content
 */
export function detectDomain(content: string): DomainType {
  const lowerContent = content.toLowerCase();

  // Legal indicators
  const legalTerms = [
    'hereby',
    'whereas',
    'pursuant',
    'notwithstanding',
    'defendant',
    'plaintiff',
    'jurisdiction',
    'contractual',
    'liability',
  ];
  if (legalTerms.filter((t) => lowerContent.includes(t)).length >= 3) {
    return 'legal';
  }

  // Medical indicators
  const medicalTerms = [
    'patient',
    'diagnosis',
    'treatment',
    'clinical',
    'symptoms',
    'medication',
    'dosage',
    'prognosis',
  ];
  if (medicalTerms.filter((t) => lowerContent.includes(t)).length >= 3) {
    return 'medical';
  }

  // Technical indicators
  const technicalTerms = ['function', 'api', 'endpoint', 'parameter', 'return', 'class', 'method'];
  if (technicalTerms.filter((t) => lowerContent.includes(t)).length >= 3) {
    return 'technical';
  }

  // Scientific indicators
  const scientificTerms = [
    'hypothesis',
    'methodology',
    'results',
    'conclusion',
    'experiment',
    'data',
    'analysis',
  ];
  if (scientificTerms.filter((t) => lowerContent.includes(t)).length >= 3) {
    return 'scientific';
  }

  // Financial indicators
  const financialTerms = [
    'revenue',
    'profit',
    'quarter',
    'earnings',
    'market',
    'stock',
    'investment',
    'fiscal',
  ];
  if (financialTerms.filter((t) => lowerContent.includes(t)).length >= 3) {
    return 'financial';
  }

  // E-commerce indicators
  const ecommerceTerms = [
    'price',
    'product',
    'shipping',
    'cart',
    'buy',
    'order',
    'available',
    'stock',
  ];
  if (ecommerceTerms.filter((t) => lowerContent.includes(t)).length >= 3) {
    return 'ecommerce';
  }

  return 'general';
}

/**
 * Get domain-specific prompt augmentation
 */
export function getDomainPromptAugmentation(domain: DomainType): string {
  const augmentations: Record<DomainType, string> = {
    general: '',
    legal:
      'Prioritize documents with specific legal terminology, citations, and precedents relevant to the query.',
    medical:
      'Focus on clinical relevance, evidence-based information, and accurate medical terminology.',
    technical:
      'Emphasize code accuracy, API compatibility, and practical implementation details.',
    scientific:
      'Prioritize peer-reviewed sources, methodological rigor, and citation quality.',
    financial:
      'Focus on accuracy of financial data, regulatory compliance, and market relevance.',
    ecommerce:
      'Prioritize product relevance, availability, customer ratings, and specification matches.',
    custom: '',
  };

  return augmentations[domain] || '';
}
