/**
 * Notion Connector
 *
 * Syncs Notion pages and databases to Spring Memory.
 *
 * @module connectors/external/notion
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BaseExternalConnector,
  type ConnectorConfig,
  type TokenSet,
  type ConnectionInfo,
  type ListOptions,
  type ListResult,
  type ExternalItem,
  registerConnector,
} from './base';

// =============================================================================
// Types
// =============================================================================

interface NotionTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_name: string;
  workspace_icon: string | null;
  workspace_id: string;
  owner: {
    type: string;
    user?: {
      id: string;
      name: string;
      avatar_url: string | null;
      type: string;
      person?: { email: string };
    };
  };
}

interface NotionPage {
  object: 'page';
  id: string;
  created_time: string;
  last_edited_time: string;
  parent: {
    type: string;
    page_id?: string;
    database_id?: string;
    workspace?: boolean;
  };
  properties: Record<string, NotionProperty>;
  url: string;
  icon?: { type: string; emoji?: string };
}

interface NotionProperty {
  type: string;
  title?: Array<{ plain_text: string }>;
  rich_text?: Array<{ plain_text: string }>;
  // Other property types...
}

interface NotionBlock {
  object: 'block';
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

interface NotionSearchResponse {
  results: NotionPage[];
  next_cursor: string | null;
  has_more: boolean;
}

interface NotionBlocksResponse {
  results: NotionBlock[];
  next_cursor: string | null;
  has_more: boolean;
}

// =============================================================================
// Constants
// =============================================================================

const NOTION_AUTH_URL = 'https://api.notion.com/v1/oauth/authorize';
const NOTION_TOKEN_URL = 'https://api.notion.com/v1/oauth/token';
const NOTION_API_URL = 'https://api.notion.com/v1';
const NOTION_API_VERSION = '2022-06-28';

// =============================================================================
// Notion Connector
// =============================================================================

export class NotionConnector extends BaseExternalConnector {
  readonly type = 'notion' as const;
  readonly name = 'Notion';
  readonly description = 'Sync pages from Notion';
  readonly icon = 'notion';

  constructor(supabase: SupabaseClient, config: ConnectorConfig) {
    super(supabase, config);
  }

  // ===========================================================================
  // OAuth
  // ===========================================================================

  getAuthUrl(state: string, _userId: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      owner: 'user',
      state,
    });

    return `${NOTION_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, _state: string): Promise<TokenSet> {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const response = await fetch(NOTION_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion OAuth error: ${error}`);
    }

    const data: NotionTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      // Notion access tokens don't expire
      scope: 'read_content',
    };
  }

  async refreshToken(_refreshToken: string): Promise<TokenSet> {
    // Notion tokens don't expire and don't have refresh tokens
    throw new Error('Notion tokens do not support refresh');
  }

  async revokeToken(_accessToken: string): Promise<void> {
    // Notion doesn't have a revoke endpoint - users disconnect via Notion settings
  }

  // ===========================================================================
  // Connection Info
  // ===========================================================================

  async getConnectionInfo(accessToken: string): Promise<ConnectionInfo> {
    // Decode bot info from token response (cached during callback)
    // For now, fetch from users/me endpoint
    const response = await fetch(`${NOTION_API_URL}/users/me`, {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const data = await response.json();

    return {
      id: data.bot?.owner?.user?.id ?? data.id,
      accountId: data.bot?.workspace_id ?? data.id,
      accountEmail: data.bot?.owner?.user?.person?.email,
      accountName: data.bot?.owner?.user?.name ?? data.name,
      metadata: {
        workspaceName: data.bot?.workspace_name,
        workspaceIcon: data.bot?.workspace_icon,
        type: data.type,
      },
    };
  }

  // ===========================================================================
  // Content Retrieval
  // ===========================================================================

  async listItems(
    accessToken: string,
    options: ListOptions = {}
  ): Promise<ListResult<ExternalItem>> {
    const body: Record<string, unknown> = {
      filter: {
        property: 'object',
        value: 'page',
      },
      sort: {
        direction: 'descending',
        timestamp: 'last_edited_time',
      },
      page_size: options.limit ?? 100,
    };

    if (options.cursor) {
      body.start_cursor = options.cursor;
    }

    const response = await fetch(`${NOTION_API_URL}/search`, {
      method: 'POST',
      headers: this.getHeaders(accessToken),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Notion search error: ${error}`);
    }

    const data: NotionSearchResponse = await response.json();

    const items: ExternalItem[] = await Promise.all(
      data.results.map((page) => this.mapPageToExternalItem(page, accessToken))
    );

    return {
      items,
      nextCursor: data.next_cursor ?? undefined,
      hasMore: data.has_more,
    };
  }

  async getItem(accessToken: string, itemId: string): Promise<ExternalItem> {
    const response = await fetch(`${NOTION_API_URL}/pages/${itemId}`, {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to get page: ${itemId}`);
    }

    const page: NotionPage = await response.json();
    return this.mapPageToExternalItem(page, accessToken);
  }

  async getItemContent(accessToken: string, itemId: string): Promise<string> {
    const blocks = await this.getPageBlocks(accessToken, itemId);
    return this.blocksToMarkdown(blocks);
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${NOTION_API_URL}/users/me`, {
        headers: this.getHeaders(accessToken),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private getHeaders(accessToken: string): HeadersInit {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_API_VERSION,
      'Content-Type': 'application/json',
    };
  }

  private async getPageBlocks(
    accessToken: string,
    pageId: string,
    cursor?: string
  ): Promise<NotionBlock[]> {
    const url = new URL(`${NOTION_API_URL}/blocks/${pageId}/children`);
    if (cursor) {
      url.searchParams.set('start_cursor', cursor);
    }

    const response = await fetch(url.toString(), {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to get blocks for page: ${pageId}`);
    }

    const data: NotionBlocksResponse = await response.json();
    let blocks = data.results;

    // Recursively get children
    for (const block of blocks) {
      if (block.has_children) {
        const children = await this.getPageBlocks(accessToken, block.id);
        (block as Record<string, unknown>).children = children;
      }
    }

    // Fetch more if there are more pages
    if (data.has_more && data.next_cursor) {
      const moreBlocks = await this.getPageBlocks(accessToken, pageId, data.next_cursor);
      blocks = [...blocks, ...moreBlocks];
    }

    return blocks;
  }

  private async mapPageToExternalItem(
    page: NotionPage,
    accessToken: string
  ): Promise<ExternalItem> {
    const title = this.getPageTitle(page);
    let content = '';

    try {
      content = await this.getItemContent(accessToken, page.id);
    } catch (error) {
      console.warn(`Failed to get content for page ${page.id}:`, error);
    }

    return {
      id: page.id,
      parentId: page.parent.page_id ?? page.parent.database_id,
      title,
      content,
      mimeType: 'text/markdown',
      sourceUrl: page.url,
      createdAt: new Date(page.created_time),
      modifiedAt: new Date(page.last_edited_time),
      metadata: {
        icon: page.icon?.emoji,
        parentType: page.parent.type,
      },
    };
  }

  private getPageTitle(page: NotionPage): string {
    // Try to get title from properties
    for (const prop of Object.values(page.properties)) {
      if (prop.type === 'title' && prop.title) {
        return prop.title.map((t) => t.plain_text).join('');
      }
    }
    return 'Untitled';
  }

  private blocksToMarkdown(blocks: NotionBlock[], depth = 0): string {
    const lines: string[] = [];
    const indent = '  '.repeat(depth);

    for (const block of blocks) {
      const line = this.blockToMarkdown(block, indent);
      if (line) {
        lines.push(line);
      }

      // Handle children
      const children = (block as Record<string, unknown>).children as NotionBlock[] | undefined;
      if (children && children.length > 0) {
        lines.push(this.blocksToMarkdown(children, depth + 1));
      }
    }

    return lines.join('\n');
  }

  private blockToMarkdown(block: NotionBlock, indent: string): string {
    const type = block.type;
    const content = block[type] as Record<string, unknown> | undefined;

    if (!content) return '';

    switch (type) {
      case 'paragraph':
        return indent + this.richTextToString(content.rich_text as Array<{ plain_text: string }>);

      case 'heading_1':
        return `${indent}# ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'heading_2':
        return `${indent}## ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'heading_3':
        return `${indent}### ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'bulleted_list_item':
        return `${indent}- ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'numbered_list_item':
        return `${indent}1. ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'to_do':
        const checked = content.checked ? 'x' : ' ';
        return `${indent}- [${checked}] ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'toggle':
        return `${indent}> ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'code':
        const lang = content.language ?? '';
        const code = this.richTextToString(content.rich_text as Array<{ plain_text: string }>);
        return `${indent}\`\`\`${lang}\n${code}\n${indent}\`\`\``;

      case 'quote':
        return `${indent}> ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'divider':
        return `${indent}---`;

      case 'callout':
        const emoji = (content.icon as Record<string, string>)?.emoji ?? '';
        return `${indent}> ${emoji} ${this.richTextToString(content.rich_text as Array<{ plain_text: string }>)}`;

      case 'image':
        const url = (content as Record<string, unknown>).file
          ? ((content as Record<string, unknown>).file as Record<string, string>).url
          : ((content as Record<string, unknown>).external as Record<string, string>)?.url;
        return url ? `${indent}![image](${url})` : '';

      default:
        // Try to extract text from unknown block types
        if (content.rich_text) {
          return indent + this.richTextToString(content.rich_text as Array<{ plain_text: string }>);
        }
        return '';
    }
  }

  private richTextToString(richText: Array<{ plain_text: string }> | undefined): string {
    if (!richText) return '';
    return richText.map((t) => t.plain_text).join('');
  }
}

// =============================================================================
// Registration
// =============================================================================

registerConnector('notion', (supabase, config) => new NotionConnector(supabase, config));

export function createNotionConnector(
  supabase: SupabaseClient,
  config?: Partial<ConnectorConfig>
): NotionConnector {
  const fullConfig: ConnectorConfig = {
    clientId: process.env.NOTION_CLIENT_ID ?? '',
    clientSecret: process.env.NOTION_CLIENT_SECRET ?? '',
    redirectUri: process.env.NOTION_REDIRECT_URI ?? '',
    scopes: [], // Notion doesn't use scopes in OAuth
    ...config,
  };

  return new NotionConnector(supabase, fullConfig);
}
