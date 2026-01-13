/**
 * Seizn Winter - Federated Module
 *
 * Multi-source federation for querying across distributed data sources.
 */

// Types
export * from './types';

// Federation Engine
export {
  FederationEngine,
  getFederationEngine,
  createFederationEngine,
} from './federation-engine';

// Source Connectors
export {
  createConnector,
  type SourceConnector,
  type ConnectorSearchOptions,
  type ConnectorSearchResult,
} from './source-connector';
