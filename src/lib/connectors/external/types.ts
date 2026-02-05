/**
 * External Connector Types
 *
 * Type definitions for external service connectors.
 *
 * @module lib/connectors/external/types
 */

// =============================================================================
// Connector Types
// =============================================================================

export type ConnectorType = 'google_drive' | 'notion' | 'github';

export type ConnectorStatus = 'active' | 'expired' | 'revoked' | 'error';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'completed';

// =============================================================================
// Token Types
// =============================================================================

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
}

// =============================================================================
// External Item Types
// =============================================================================

export interface ExternalItem {
  /** External service item ID */
  id: string;
  /** Item title */
  title: string;
  /** Extracted text content */
  content: string;
  /** MIME type of the original item */
  mimeType: string;
  /** URL to the original item */
  sourceUrl: string;
  /** Last modified date */
  lastModified: Date;
  /** Item-specific metadata */
  metadata: Record<string, unknown>;
  /** Parent folder/page ID if applicable */
  parentId?: string;
  /** Item type (file, folder, page, etc.) */
  itemType: string;
}

export interface ExternalFolder {
  id: string;
  name: string;
  parentId?: string;
  path: string;
}

// =============================================================================
// List Options
// =============================================================================

export interface ListOptions {
  /** Folder/parent ID to list from */
  folderId?: string;
  /** Page token for pagination */
  pageToken?: string;
  /** Maximum items per page */
  pageSize?: number;
  /** Item types to include */
  itemTypes?: string[];
  /** Modified after this date */
  modifiedAfter?: Date;
  /** Include items in subfolders */
  recursive?: boolean;
}

export interface ListResult {
  items: ExternalItem[];
  nextPageToken?: string;
  hasMore: boolean;
}

// =============================================================================
// Sync Types
// =============================================================================

export interface SyncConfig {
  /** Enable automatic sync */
  autoSync: boolean;
  /** Sync interval in hours */
  syncIntervalHours: number;
  /** Folders to sync (empty = all) */
  includeFolders?: string[];
  /** Folders to exclude */
  excludeFolders?: string[];
  /** File types to include (MIME types) */
  includeTypes?: string[];
  /** Maximum file size in bytes */
  maxFileSize?: number;
}

export interface SyncResult {
  /** Items synced successfully */
  synced: number;
  /** Items skipped (unchanged) */
  skipped: number;
  /** Items failed */
  failed: number;
  /** Error details */
  errors: Array<{ itemId: string; error: string }>;
  /** Sync duration in ms */
  durationMs: number;
  /** Next sync token */
  syncToken?: string;
}

export interface SyncProgress {
  status: SyncStatus;
  total: number;
  processed: number;
  synced: number;
  failed: number;
  currentItem?: string;
  startedAt?: Date;
  error?: string;
}

// =============================================================================
// Connection Types
// =============================================================================

export interface ExternalConnection {
  id: string;
  userId: string;
  connectorType: ConnectorType;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  accountInfo: {
    email?: string;
    name?: string;
    avatarUrl?: string;
    [key: string]: unknown;
  };
  syncConfig: SyncConfig;
  lastSyncAt?: Date;
  lastSyncResult?: SyncResult;
  status: ConnectorStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncItem {
  id: string;
  connectionId: string;
  externalId: string;
  title: string;
  sourceUrl: string;
  memoryId?: string;
  contentHash: string;
  lastSyncedAt: Date;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// Webhook Types
// =============================================================================

export interface WebhookPayload {
  connectorType: ConnectorType;
  event: string;
  data: unknown;
  timestamp: Date;
}

// =============================================================================
// Connector Interface
// =============================================================================

export interface ExternalConnector {
  /** Connector identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Connector type */
  readonly type: ConnectorType;
  /** Supported MIME types */
  readonly supportedTypes: string[];

  // OAuth Methods
  getAuthUrl(state: string, redirectUri: string): string;
  handleCallback(code: string, redirectUri: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
  revokeToken(accessToken: string): Promise<void>;

  // Account Methods
  getAccountInfo(accessToken: string): Promise<ExternalConnection['accountInfo']>;

  // Content Methods
  listItems(accessToken: string, options?: ListOptions): Promise<ListResult>;
  getItem(accessToken: string, itemId: string): Promise<ExternalItem>;
  getItemContent(accessToken: string, itemId: string): Promise<string>;

  // Sync Methods
  syncToMemories(
    connection: ExternalConnection,
    items: ExternalItem[],
    onProgress?: (progress: SyncProgress) => void
  ): Promise<SyncResult>;

  // Webhook Methods (optional)
  setupWebhook?(connection: ExternalConnection, webhookUrl: string): Promise<string>;
  handleWebhook?(payload: unknown): Promise<WebhookPayload>;
}
