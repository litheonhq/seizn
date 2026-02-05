/**
 * External Connectors Module
 *
 * Unified exports for external source connectors.
 *
 * @module connectors/external
 */

// Base
export {
  type ConnectorType,
  type TokenSet,
  type ListOptions,
  type ListResult,
  type ExternalItem,
  type SyncResult,
  type ConnectionInfo,
  type ConnectorConfig,
  type WebhookPayload,
  type ExternalConnector,
  type SyncOptions,
  type ConnectorFactory,
  BaseExternalConnector,
  registerConnector,
  createConnector,
  getRegisteredConnectors,
} from './base';

// Google Drive
export { GoogleDriveConnector, createGoogleDriveConnector } from './google-drive';

// Notion
export { NotionConnector, createNotionConnector } from './notion';

// GitHub
export { GitHubConnector, createGitHubConnector } from './github';

// =============================================================================
// Connector Factory Helper
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConnectorType, ExternalConnector, ConnectorConfig } from './base';
import { createGoogleDriveConnector } from './google-drive';
import { createNotionConnector } from './notion';
import { createGitHubConnector } from './github';

/**
 * Get connector instance by type with auto-configuration from env
 */
export function getConnector(
  type: ConnectorType,
  supabase: SupabaseClient,
  config?: Partial<ConnectorConfig>
): ExternalConnector | null {
  switch (type) {
    case 'google_drive':
      return createGoogleDriveConnector(supabase, config);
    case 'notion':
      return createNotionConnector(supabase, config);
    case 'github':
      return createGitHubConnector(supabase, config);
    default:
      return null;
  }
}

/**
 * Get all available connector types
 */
export function getAvailableConnectors(): Array<{
  type: ConnectorType;
  name: string;
  description: string;
  icon: string;
  configured: boolean;
}> {
  return [
    {
      type: 'google_drive',
      name: 'Google Drive',
      description: 'Sync documents from Google Drive',
      icon: 'google-drive',
      configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    },
    {
      type: 'notion',
      name: 'Notion',
      description: 'Sync pages and databases from Notion',
      icon: 'notion',
      configured: !!(process.env.NOTION_CLIENT_ID && process.env.NOTION_CLIENT_SECRET),
    },
    {
      type: 'github',
      name: 'GitHub',
      description: 'Sync repositories and issues from GitHub',
      icon: 'github',
      configured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
    },
  ];
}
