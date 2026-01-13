/**
 * Source Suggester for Knowledge Gap Filling
 *
 * Suggests sources (URLs, documents, connectors) that could fill
 * a detected knowledge gap based on gap type and missing entities.
 */

import type {
  GapType,
  MissingEntity,
  SuggestedSource,
  SuggestedSourceType,
  SourcePriority,
  KnowledgeGapConfig,
} from './types';

// =============================================================================
// Source Templates by Gap Type
// =============================================================================

interface SourceTemplate {
  sourceType: SuggestedSourceType;
  urlPattern?: string;
  priority: SourcePriority;
  reason: string;
  applicableGapTypes: GapType[];
}

const SOURCE_TEMPLATES: SourceTemplate[] = [
  // Documentation sources
  {
    sourceType: 'web_url',
    urlPattern: 'https://docs.${domain}.com',
    priority: 'high',
    reason: 'Official documentation may contain the missing information',
    applicableGapTypes: ['missing_entity', 'coverage_gap', 'domain_mismatch'],
  },
  {
    sourceType: 'web_url',
    urlPattern: 'https://github.com/${org}/${repo}',
    priority: 'medium',
    reason: 'GitHub repository may have relevant code or documentation',
    applicableGapTypes: ['missing_entity', 'coverage_gap'],
  },

  // Wiki/Knowledge bases
  {
    sourceType: 'web_url',
    urlPattern: 'https://en.wikipedia.org/wiki/${entity}',
    priority: 'medium',
    reason: 'Wikipedia may have general information about this entity',
    applicableGapTypes: ['missing_entity'],
  },

  // News/Updates for temporal gaps
  {
    sourceType: 'web_url',
    urlPattern: 'https://news.google.com/search?q=${query}',
    priority: 'high',
    reason: 'Recent news may contain the latest information',
    applicableGapTypes: ['outdated_doc'],
  },

  // Data sources for tabular gaps
  {
    sourceType: 'web_url',
    urlPattern: 'https://data.${domain}.com',
    priority: 'high',
    reason: 'Data portal may have the requested structured data',
    applicableGapTypes: ['missing_table'],
  },

  // Internal document suggestions
  {
    sourceType: 'internal_doc',
    priority: 'high',
    reason: 'Related internal documents may provide context',
    applicableGapTypes: ['coverage_gap', 'permission_denied'],
  },

  // API connectors
  {
    sourceType: 'api_connector',
    priority: 'medium',
    reason: 'API integration could provide real-time data',
    applicableGapTypes: ['outdated_doc', 'missing_table'],
  },

  // Manual upload
  {
    sourceType: 'manual_upload',
    priority: 'low',
    reason: 'Manual document upload may be needed for proprietary content',
    applicableGapTypes: ['missing_entity', 'coverage_gap', 'domain_mismatch'],
  },
];

// =============================================================================
// Domain-specific URL Patterns
// =============================================================================

interface DomainSource {
  domain: string;
  patterns: string[];
  entityTypes: string[];
  priority: SourcePriority;
}

const DOMAIN_SOURCES: DomainSource[] = [
  // Technology companies
  {
    domain: 'google',
    patterns: [
      'https://developers.google.com',
      'https://cloud.google.com/docs',
      'https://support.google.com',
    ],
    entityTypes: ['organization', 'product'],
    priority: 'high',
  },
  {
    domain: 'microsoft',
    patterns: [
      'https://docs.microsoft.com',
      'https://learn.microsoft.com',
      'https://azure.microsoft.com/docs',
    ],
    entityTypes: ['organization', 'product'],
    priority: 'high',
  },
  {
    domain: 'amazon',
    patterns: [
      'https://docs.aws.amazon.com',
      'https://aws.amazon.com/documentation',
    ],
    entityTypes: ['organization', 'product'],
    priority: 'high',
  },
  {
    domain: 'openai',
    patterns: [
      'https://platform.openai.com/docs',
      'https://help.openai.com',
    ],
    entityTypes: ['organization', 'product', 'concept'],
    priority: 'high',
  },
  {
    domain: 'anthropic',
    patterns: [
      'https://docs.anthropic.com',
      'https://console.anthropic.com/docs',
    ],
    entityTypes: ['organization', 'product', 'concept'],
    priority: 'high',
  },

  // Development frameworks
  {
    domain: 'react',
    patterns: ['https://react.dev', 'https://reactjs.org/docs'],
    entityTypes: ['product', 'concept'],
    priority: 'high',
  },
  {
    domain: 'nextjs',
    patterns: ['https://nextjs.org/docs'],
    entityTypes: ['product', 'concept'],
    priority: 'high',
  },
  {
    domain: 'python',
    patterns: ['https://docs.python.org', 'https://pypi.org'],
    entityTypes: ['product', 'concept'],
    priority: 'high',
  },

  // Databases
  {
    domain: 'postgresql',
    patterns: ['https://www.postgresql.org/docs'],
    entityTypes: ['product', 'concept'],
    priority: 'high',
  },
  {
    domain: 'supabase',
    patterns: ['https://supabase.com/docs'],
    entityTypes: ['product', 'concept', 'organization'],
    priority: 'high',
  },

  // General knowledge
  {
    domain: 'wikipedia',
    patterns: ['https://en.wikipedia.org/wiki'],
    entityTypes: ['person', 'organization', 'location', 'event', 'concept'],
    priority: 'medium',
  },
];

// =============================================================================
// Source Suggestion Logic
// =============================================================================

/**
 * Generate search URLs for an entity
 */
function generateSearchUrls(entity: MissingEntity): SuggestedSource[] {
  const sources: SuggestedSource[] = [];
  const entityEncoded = encodeURIComponent(entity.name);

  // Google Search
  sources.push({
    sourceType: 'web_url',
    identifier: `https://www.google.com/search?q=${entityEncoded}`,
    priority: 'medium',
    reason: `Web search for "${entity.name}"`,
    metadata: {
      title: `Search: ${entity.name}`,
      domain: 'google.com',
    },
  });

  // Type-specific searches
  switch (entity.type) {
    case 'person':
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.linkedin.com/search/results/people/?keywords=${entityEncoded}`,
        priority: 'medium',
        reason: `LinkedIn profile for "${entity.name}"`,
        metadata: { domain: 'linkedin.com' },
      });
      break;

    case 'organization':
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.crunchbase.com/textsearch?q=${entityEncoded}`,
        priority: 'medium',
        reason: `Company information for "${entity.name}"`,
        metadata: { domain: 'crunchbase.com' },
      });
      break;

    case 'product':
    case 'concept':
      sources.push({
        sourceType: 'web_url',
        identifier: `https://github.com/search?q=${entityEncoded}&type=repositories`,
        priority: 'medium',
        reason: `GitHub repositories for "${entity.name}"`,
        metadata: { domain: 'github.com' },
      });
      break;

    case 'location':
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.google.com/maps/search/${entityEncoded}`,
        priority: 'low',
        reason: `Map location for "${entity.name}"`,
        metadata: { domain: 'google.com/maps' },
      });
      break;

    case 'event':
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.eventbrite.com/d/online/${entityEncoded}`,
        priority: 'low',
        reason: `Event information for "${entity.name}"`,
        metadata: { domain: 'eventbrite.com' },
      });
      break;
  }

  return sources;
}

/**
 * Find domain-specific sources for entities
 */
function findDomainSources(entities: MissingEntity[]): SuggestedSource[] {
  const sources: SuggestedSource[] = [];
  const addedUrls = new Set<string>();

  for (const entity of entities) {
    const entityLower = entity.name.toLowerCase();

    for (const domainSource of DOMAIN_SOURCES) {
      // Check if entity matches this domain
      if (
        entityLower.includes(domainSource.domain) ||
        domainSource.entityTypes.includes(entity.type)
      ) {
        for (const pattern of domainSource.patterns) {
          if (!addedUrls.has(pattern)) {
            addedUrls.add(pattern);
            sources.push({
              sourceType: 'web_url',
              identifier: pattern,
              priority: domainSource.priority,
              reason: `Official documentation that may contain information about "${entity.name}"`,
              metadata: {
                domain: new URL(pattern).hostname,
              },
            });
          }
        }
      }
    }
  }

  return sources;
}

/**
 * Suggest sources based on gap type
 */
function suggestByGapType(
  gapType: GapType,
  query: string
): SuggestedSource[] {
  const sources: SuggestedSource[] = [];
  const queryEncoded = encodeURIComponent(query);

  switch (gapType) {
    case 'outdated_doc':
      // Suggest news and recent content sources
      sources.push({
        sourceType: 'web_url',
        identifier: `https://news.google.com/search?q=${queryEncoded}`,
        priority: 'high',
        reason: 'Recent news articles may have updated information',
        metadata: { domain: 'news.google.com' },
      });
      sources.push({
        sourceType: 'api_connector',
        identifier: 'news_api',
        priority: 'medium',
        reason: 'News API connector for real-time updates',
      });
      break;

    case 'missing_table':
      // Suggest data sources
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.kaggle.com/search?q=${queryEncoded}`,
        priority: 'medium',
        reason: 'Kaggle datasets may have the requested data',
        metadata: { domain: 'kaggle.com' },
      });
      sources.push({
        sourceType: 'api_connector',
        identifier: 'data_api',
        priority: 'high',
        reason: 'Data API connector for structured data access',
      });
      sources.push({
        sourceType: 'manual_upload',
        identifier: 'spreadsheet',
        priority: 'medium',
        reason: 'Upload a spreadsheet with the required data',
      });
      break;

    case 'permission_denied':
      // Suggest access request
      sources.push({
        sourceType: 'internal_doc',
        identifier: 'request_access',
        priority: 'high',
        reason: 'Request access to restricted documents',
      });
      break;

    case 'domain_mismatch':
      // Suggest adding domain-specific sources
      sources.push({
        sourceType: 'federated_source',
        identifier: 'domain_collection',
        priority: 'high',
        reason: 'Connect to a collection that covers this domain',
      });
      sources.push({
        sourceType: 'manual_upload',
        identifier: 'domain_docs',
        priority: 'medium',
        reason: 'Upload domain-specific documentation',
      });
      break;

    case 'coverage_gap':
      // Suggest expanding coverage
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.google.com/search?q=${queryEncoded}+documentation`,
        priority: 'medium',
        reason: 'Additional documentation to expand coverage',
        metadata: { domain: 'google.com' },
      });
      sources.push({
        sourceType: 'internal_doc',
        identifier: 'related_docs',
        priority: 'high',
        reason: 'Related internal documents that may help',
      });
      break;

    case 'missing_entity':
    default:
      // Generic search suggestions
      sources.push({
        sourceType: 'web_url',
        identifier: `https://www.google.com/search?q=${queryEncoded}`,
        priority: 'medium',
        reason: 'Web search for the missing information',
        metadata: { domain: 'google.com' },
      });
      break;
  }

  return sources;
}

// =============================================================================
// Main Export Function
// =============================================================================

/**
 * Suggest sources to fill a knowledge gap
 *
 * @param gapType - The type of knowledge gap detected
 * @param missingEntities - Entities mentioned in query but not found
 * @param query - The original query text
 * @param config - Configuration options
 * @returns Array of suggested sources
 */
export async function suggestSources(
  gapType: GapType,
  missingEntities: MissingEntity[],
  query: string,
  config: Partial<KnowledgeGapConfig> = {}
): Promise<SuggestedSource[]> {
  const maxSuggestions = config.maxSuggestionsPerSource ?? 5;
  const allSources: SuggestedSource[] = [];
  const seenIdentifiers = new Set<string>();

  // Helper to add unique sources
  const addSource = (source: SuggestedSource) => {
    if (!seenIdentifiers.has(source.identifier)) {
      seenIdentifiers.add(source.identifier);
      allSources.push(source);
    }
  };

  // 1. Suggest sources based on gap type
  const gapTypeSources = suggestByGapType(gapType, query);
  for (const source of gapTypeSources) {
    addSource(source);
  }

  // 2. Generate search URLs for missing entities
  if (config.suggestWebSources !== false && missingEntities.length > 0) {
    for (const entity of missingEntities.slice(0, 3)) {
      const entitySources = generateSearchUrls(entity);
      for (const source of entitySources) {
        addSource(source);
      }
    }
  }

  // 3. Find domain-specific sources
  if (config.suggestWebSources !== false && missingEntities.length > 0) {
    const domainSources = findDomainSources(missingEntities);
    for (const source of domainSources) {
      addSource(source);
    }
  }

  // 4. Suggest internal document search if enabled
  if (config.suggestInternalDocs !== false) {
    addSource({
      sourceType: 'internal_doc',
      identifier: 'search_existing',
      priority: 'medium',
      reason: 'Search existing documents that may be related',
    });
  }

  // Sort by priority and limit
  const priorityOrder: Record<SourcePriority, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return allSources
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, maxSuggestions * 3); // Allow more suggestions but prioritized
}

/**
 * Generate actionable suggestions with specific URLs
 */
export function generateActionableSuggestions(
  sources: SuggestedSource[]
): Array<{
  action: string;
  url?: string;
  description: string;
  priority: SourcePriority;
}> {
  return sources.map((source) => {
    switch (source.sourceType) {
      case 'web_url':
        return {
          action: 'ingest_url',
          url: source.identifier,
          description: source.reason,
          priority: source.priority,
        };
      case 'internal_doc':
        return {
          action: 'search_internal',
          description: source.reason,
          priority: source.priority,
        };
      case 'api_connector':
        return {
          action: 'connect_api',
          description: source.reason,
          priority: source.priority,
        };
      case 'manual_upload':
        return {
          action: 'upload_document',
          description: source.reason,
          priority: source.priority,
        };
      case 'federated_source':
        return {
          action: 'add_federated_source',
          description: source.reason,
          priority: source.priority,
        };
      default:
        return {
          action: 'investigate',
          description: source.reason,
          priority: source.priority,
        };
    }
  });
}
