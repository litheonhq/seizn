/**
 * Google Drive Connector
 *
 * Syncs Google Drive documents (Docs, Sheets, Slides, PDFs) to Spring Memory.
 *
 * @module connectors/external/google-drive
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

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  webViewLink?: string;
  createdTime?: string;
  modifiedTime: string;
  size?: string;
  description?: string;
  owners?: Array<{ emailAddress: string; displayName: string }>;
}

interface GoogleDriveListResponse {
  files: GoogleDriveFile[];
  nextPageToken?: string;
}

// =============================================================================
// Constants
// =============================================================================

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';

const EXPORTABLE_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
  'application/vnd.google-apps.drawing': 'image/png',
};

const READABLE_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/html',
  'application/pdf',
  'application/json',
  'text/csv',
];

// =============================================================================
// Google Drive Connector
// =============================================================================

export class GoogleDriveConnector extends BaseExternalConnector {
  readonly type = 'google_drive' as const;
  readonly name = 'Google Drive';
  readonly description = 'Sync documents from Google Drive';
  readonly icon = 'google-drive';

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
      scope: this.config.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, _state: string): Promise<TokenSet> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
        code,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google OAuth error: ${error}`);
    }

    const data: GoogleTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenSet> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token refresh error: ${error}`);
    }

    const data: GoogleTokenResponse = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async revokeToken(accessToken: string): Promise<void> {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
      method: 'POST',
    });
  }

  // ===========================================================================
  // Connection Info
  // ===========================================================================

  async getConnectionInfo(accessToken: string): Promise<ConnectionInfo> {
    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo: GoogleUserInfo = await response.json();

    return {
      id: userInfo.id,
      accountId: userInfo.id,
      accountEmail: userInfo.email,
      accountName: userInfo.name,
      metadata: {
        picture: userInfo.picture,
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
    const query = this.buildSearchQuery(options);

    const params = new URLSearchParams({
      q: query,
      fields: 'files(id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,size,description,owners),nextPageToken',
      pageSize: String(options.limit ?? 100),
      orderBy: 'modifiedTime desc',
    });

    if (options.cursor) {
      params.append('pageToken', options.cursor);
    }

    const response = await fetch(`${GOOGLE_DRIVE_API}/files?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Drive API error: ${error}`);
    }

    const data: GoogleDriveListResponse = await response.json();

    const items: ExternalItem[] = await Promise.all(
      data.files
        .filter((file) => this.isSupportedFile(file))
        .map(async (file) => this.mapToExternalItem(file, accessToken))
    );

    return {
      items,
      nextCursor: data.nextPageToken,
      hasMore: !!data.nextPageToken,
    };
  }

  async getItem(accessToken: string, itemId: string): Promise<ExternalItem> {
    const response = await fetch(
      `${GOOGLE_DRIVE_API}/files/${itemId}?fields=id,name,mimeType,parents,webViewLink,createdTime,modifiedTime,size,description,owners`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file: ${itemId}`);
    }

    const file: GoogleDriveFile = await response.json();
    return this.mapToExternalItem(file, accessToken);
  }

  async getItemContent(accessToken: string, itemId: string): Promise<string> {
    // First get file metadata to determine type
    const metaResponse = await fetch(
      `${GOOGLE_DRIVE_API}/files/${itemId}?fields=mimeType`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!metaResponse.ok) {
      throw new Error(`Failed to get file metadata: ${itemId}`);
    }

    const { mimeType } = await metaResponse.json();

    // Export Google Docs/Sheets/Slides
    if (EXPORTABLE_MIME_TYPES[mimeType]) {
      const exportMime = EXPORTABLE_MIME_TYPES[mimeType];
      const response = await fetch(
        `${GOOGLE_DRIVE_API}/files/${itemId}/export?mimeType=${encodeURIComponent(exportMime)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to export file: ${itemId}`);
      }

      return response.text();
    }

    // Download regular files
    const response = await fetch(
      `${GOOGLE_DRIVE_API}/files/${itemId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${itemId}`);
    }

    // Handle based on content type
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/pdf')) {
      // For PDFs, we'd need a PDF parser - return placeholder
      return '[PDF content - extraction not implemented]';
    }

    return response.text();
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${GOOGLE_DRIVE_API}/about?fields=user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  private buildSearchQuery(options: ListOptions): string {
    const conditions: string[] = [
      "trashed = false",
    ];

    if (options.parentId) {
      conditions.push(`'${options.parentId}' in parents`);
    }

    if (options.modifiedAfter) {
      conditions.push(`modifiedTime > '${options.modifiedAfter.toISOString()}'`);
    }

    // Include supported mime types
    const mimeConditions = [
      ...Object.keys(EXPORTABLE_MIME_TYPES).map(m => `mimeType = '${m}'`),
      ...READABLE_MIME_TYPES.map(m => `mimeType = '${m}'`),
    ];
    conditions.push(`(${mimeConditions.join(' or ')})`);

    return conditions.join(' and ');
  }

  private isSupportedFile(file: GoogleDriveFile): boolean {
    return (
      Object.keys(EXPORTABLE_MIME_TYPES).includes(file.mimeType) ||
      READABLE_MIME_TYPES.includes(file.mimeType)
    );
  }

  private async mapToExternalItem(
    file: GoogleDriveFile,
    accessToken: string
  ): Promise<ExternalItem> {
    let content = '';
    try {
      content = await this.getItemContent(accessToken, file.id);
    } catch (error) {
      console.warn(`Failed to get content for ${file.id}:`, error);
    }

    return {
      id: file.id,
      parentId: file.parents?.[0],
      title: file.name,
      content,
      mimeType: file.mimeType,
      sourceUrl: file.webViewLink ?? `https://drive.google.com/file/d/${file.id}`,
      createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
      modifiedAt: new Date(file.modifiedTime),
      metadata: {
        size: file.size,
        description: file.description,
        owner: file.owners?.[0]?.emailAddress,
      },
    };
  }
}

// =============================================================================
// Registration
// =============================================================================

registerConnector('google_drive', (supabase, config) => new GoogleDriveConnector(supabase, config));

export function createGoogleDriveConnector(
  supabase: SupabaseClient,
  config?: Partial<ConnectorConfig>
): GoogleDriveConnector {
  const fullConfig: ConnectorConfig = {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    ...config,
  };

  return new GoogleDriveConnector(supabase, fullConfig);
}
