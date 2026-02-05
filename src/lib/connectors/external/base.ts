/**
 * External Connector Base
 *
 * Base interface and types for external source connectors
 * (Google Drive, Notion, GitHub, etc.)
 *
 * @module connectors/external/base
 */

// =============================================================================
// Types
// =============================================================================

export type ConnectorType =
  | 'google_drive'
  | 'notion'
  | 'github'
  | 'slack'
  | 'confluence'
  | 'linear'
  | 'jira';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface ListOptions {
  cursor?: string;
  limit?: number;
  parentId?: string;
  modifiedAfter?: Date;
  includePatterns?: string[];
  excludePatterns?: string[];
}

export interface ListResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  total?: number;
}

export interface ExternalItem {
  id: string;
  parentId?: string;
  path?: string;
  title: string;
  content: string;
  mimeType: string;
  sourceUrl: string;
  createdAt?: Date;
  modifiedAt: Date;
  metadata: Record<string, unknown>;
}

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: Array<{ itemId: string; error: string }>;
  memoryIds: string[];
}

export interface ConnectionInfo {
  id: string;
  accountId: string;
  accountEmail?: string;
  accountName?: string;
  metadata: Record<string, unknown>;
}

export interface ConnectorConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface WebhookPayload {
  type: string;
  timestamp: Date;
  data: unknown;
}

// =============================================================================
// Base Connector Interface
// =============================================================================

export interface ExternalConnector {
  /**
   * Connector identification
   */
  readonly type: ConnectorType;
  readonly name: string;
  readonly description: string;
  readonly icon: string;

  /**
   * OAuth flow
   */
  getAuthUrl(state: string, userId: string): string;
  handleCallback(code: string, state: string): Promise<TokenSet>;
  refreshToken(refreshToken: string): Promise<TokenSet>;
  revokeToken(accessToken: string): Promise<void>;

  /**
   * Connection info
   */
  getConnectionInfo(accessToken: string): Promise<ConnectionInfo>;

  /**
   * Content retrieval
   */
  listItems(accessToken: string, options?: ListOptions): Promise<ListResult<ExternalItem>>;
  getItem(accessToken: string, itemId: string): Promise<ExternalItem>;
  getItemContent(accessToken: string, itemId: string): Promise<string>;

  /**
   * Sync to memories
   */
  syncToMemories(
    items: ExternalItem[],
    userId: string,
    connectionId: string,
    options?: SyncOptions
  ): Promise<SyncResult>;

  /**
   * Webhook handling (optional)
   */
  handleWebhook?(payload: WebhookPayload, connectionId: string): Promise<void>;

  /**
   * Health check
   */
  testConnection(accessToken: string): Promise<boolean>;
}

export interface SyncOptions {
  /** Force re-sync even if content hash matches */
  forceResync?: boolean;
  /** Memory type to create */
  noteType?: string;
  /** Tags to add to synced memories */
  tags?: string[];
  /** Namespace for memories */
  namespace?: string;
  /** Whether to extract entities from content */
  extractEntities?: boolean;
}

// =============================================================================
// Abstract Base Class
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

export abstract class BaseExternalConnector implements ExternalConnector {
  abstract readonly type: ConnectorType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly icon: string;

  constructor(
    protected supabase: SupabaseClient,
    protected config: ConnectorConfig
  ) {}

  // Abstract methods to be implemented by subclasses
  abstract getAuthUrl(state: string, userId: string): string;
  abstract handleCallback(code: string, state: string): Promise<TokenSet>;
  abstract refreshToken(refreshToken: string): Promise<TokenSet>;
  abstract revokeToken(accessToken: string): Promise<void>;
  abstract getConnectionInfo(accessToken: string): Promise<ConnectionInfo>;
  abstract listItems(accessToken: string, options?: ListOptions): Promise<ListResult<ExternalItem>>;
  abstract getItem(accessToken: string, itemId: string): Promise<ExternalItem>;
  abstract getItemContent(accessToken: string, itemId: string): Promise<string>;
  abstract testConnection(accessToken: string): Promise<boolean>;

  /**
   * Default implementation for syncing items to memories
   */
  async syncToMemories(
    items: ExternalItem[],
    userId: string,
    connectionId: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const result: SyncResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
      memoryIds: [],
    };

    for (const item of items) {
      try {
        const contentHash = this.hashContent(item.content);

        // Check if item already synced
        const { data: existingItem } = await this.supabase
          .from('external_sync_items')
          .select('id, memory_id, content_hash')
          .eq('connection_id', connectionId)
          .eq('external_id', item.id)
          .single();

        // Skip if content unchanged (unless force resync)
        if (existingItem && existingItem.content_hash === contentHash && !options.forceResync) {
          result.skipped++;
          continue;
        }

        // Create or update memory
        const memoryData = {
          user_id: userId,
          content: this.formatMemoryContent(item),
          note_type: options.noteType ?? 'document',
          tags: options.tags ?? [],
          scope: 'user',
          status: 'active',
          source: this.type,
          source_id: item.id,
          source_url: item.sourceUrl,
          payload_json: {
            connector: this.type,
            externalId: item.id,
            title: item.title,
            mimeType: item.mimeType,
            path: item.path,
            ...item.metadata,
          },
        };

        let memoryId: string;

        if (existingItem?.memory_id) {
          // Update existing memory
          const { error: updateError } = await this.supabase
            .from('spring_memory_notes')
            .update({
              content: memoryData.content,
              payload_json: memoryData.payload_json,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingItem.memory_id);

          if (updateError) throw updateError;
          memoryId = existingItem.memory_id;
          result.updated++;
        } else {
          // Create new memory
          const { data: newMemory, error: createError } = await this.supabase
            .from('spring_memory_notes')
            .insert(memoryData)
            .select('id')
            .single();

          if (createError) throw createError;
          memoryId = newMemory.id;
          result.created++;
        }

        result.memoryIds.push(memoryId);

        // Update sync item record
        await this.supabase.from('external_sync_items').upsert(
          {
            connection_id: connectionId,
            external_id: item.id,
            external_parent_id: item.parentId,
            external_path: item.path,
            title: item.title,
            mime_type: item.mimeType,
            source_url: item.sourceUrl,
            external_created_at: item.createdAt?.toISOString(),
            external_modified_at: item.modifiedAt.toISOString(),
            content_hash: contentHash,
            memory_id: memoryId,
            sync_status: 'synced',
            last_synced_at: new Date().toISOString(),
            sync_error: null,
          },
          { onConflict: 'connection_id,external_id' }
        );
      } catch (error) {
        result.failed++;
        result.errors.push({
          itemId: item.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Record sync error
        await this.supabase.from('external_sync_items').upsert(
          {
            connection_id: connectionId,
            external_id: item.id,
            title: item.title,
            sync_status: 'error',
            sync_error: error instanceof Error ? error.message : 'Unknown error',
          },
          { onConflict: 'connection_id,external_id' }
        );
      }
    }

    return result;
  }

  /**
   * Format item content for memory storage
   */
  protected formatMemoryContent(item: ExternalItem): string {
    const parts: string[] = [];

    if (item.title) {
      parts.push(`# ${item.title}`);
      parts.push('');
    }

    if (item.path) {
      parts.push(`> Source: ${item.path}`);
      parts.push('');
    }

    parts.push(item.content);

    return parts.join('\n');
  }

  /**
   * Hash content for change detection
   */
  protected hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Default webhook handler (no-op)
   */
  async handleWebhook(_payload: WebhookPayload, _connectionId: string): Promise<void> {
    // Override in subclass if needed
  }
}

// =============================================================================
// Factory
// =============================================================================

export type ConnectorFactory = (
  supabase: SupabaseClient,
  config: ConnectorConfig
) => ExternalConnector;

const connectorRegistry = new Map<ConnectorType, ConnectorFactory>();

export function registerConnector(type: ConnectorType, factory: ConnectorFactory): void {
  connectorRegistry.set(type, factory);
}

export function createConnector(
  type: ConnectorType,
  supabase: SupabaseClient,
  config: ConnectorConfig
): ExternalConnector {
  const factory = connectorRegistry.get(type);
  if (!factory) {
    throw new Error(`Unknown connector type: ${type}`);
  }
  return factory(supabase, config);
}

export function getRegisteredConnectors(): ConnectorType[] {
  return Array.from(connectorRegistry.keys());
}
