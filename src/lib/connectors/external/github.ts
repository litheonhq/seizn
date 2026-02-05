/**
 * GitHub Connector
 *
 * Syncs GitHub repositories, issues, PRs, and discussions to Spring Memory.
 *
 * @module connectors/external/github
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

interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  private: boolean;
  updated_at: string;
  created_at: string;
  default_branch: string;
  language: string | null;
  topics: string[];
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  created_at: string;
  updated_at: string;
  labels: Array<{ name: string }>;
  user: { login: string };
  pull_request?: unknown;
}

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
  download_url: string | null;
  html_url: string;
}

// =============================================================================
// Constants
// =============================================================================

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_URL = 'https://api.github.com';

const READABLE_EXTENSIONS = [
  '.md', '.txt', '.json', '.yml', '.yaml', '.toml',
  '.js', '.ts', '.py', '.go', '.rs', '.java', '.rb',
  '.sh', '.bash', '.zsh', '.fish',
  '.html', '.css', '.scss', '.less',
  '.sql', '.graphql',
  '.env.example', '.gitignore', '.dockerignore',
];

// =============================================================================
// GitHub Connector
// =============================================================================

export class GitHubConnector extends BaseExternalConnector {
  readonly type = 'github' as const;
  readonly name = 'GitHub';
  readonly description = 'Sync repositories and issues from GitHub';
  readonly icon = 'github';

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
      scope: this.config.scopes.join(' '),
      state,
    });

    return `${GITHUB_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, _state: string): Promise<TokenSet> {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub OAuth error: ${error}`);
    }

    const data: GitHubTokenResponse = await response.json();

    if (!data.access_token) {
      throw new Error('No access token received');
    }

    return {
      accessToken: data.access_token,
      scope: data.scope,
    };
  }

  async refreshToken(_refreshToken: string): Promise<TokenSet> {
    // GitHub OAuth tokens don't expire by default
    throw new Error('GitHub tokens do not support refresh');
  }

  async revokeToken(accessToken: string): Promise<void> {
    // Revoke via GitHub Applications API
    await fetch(`${GITHUB_API_URL}/applications/${this.config.clientId}/token`, {
      method: 'DELETE',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: accessToken }),
    });
  }

  // ===========================================================================
  // Connection Info
  // ===========================================================================

  async getConnectionInfo(accessToken: string): Promise<ConnectionInfo> {
    const response = await fetch(`${GITHUB_API_URL}/user`, {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error('Failed to get user info');
    }

    const user: GitHubUser = await response.json();

    return {
      id: String(user.id),
      accountId: String(user.id),
      accountEmail: user.email ?? undefined,
      accountName: user.name ?? user.login,
      metadata: {
        login: user.login,
        avatarUrl: user.avatar_url,
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
    // Get user's repositories
    const repos = await this.listRepositories(accessToken, options);

    // For each repo, get key files (README, docs)
    const items: ExternalItem[] = [];

    for (const repo of repos.slice(0, options.limit ?? 10)) {
      const repoItems = await this.getRepoContent(accessToken, repo);
      items.push(...repoItems);
    }

    return {
      items,
      hasMore: repos.length === (options.limit ?? 10),
    };
  }

  async getItem(accessToken: string, itemId: string): Promise<ExternalItem> {
    // itemId format: "owner/repo/path" or "owner/repo/issues/123"
    const parts = itemId.split('/');

    if (parts.length < 2) {
      throw new Error('Invalid item ID format');
    }

    const owner = parts[0];
    const repo = parts[1];

    if (parts[2] === 'issues' && parts[3]) {
      return this.getIssue(accessToken, owner, repo, parseInt(parts[3]));
    }

    // Get file content
    const path = parts.slice(2).join('/');
    return this.getFile(accessToken, owner, repo, path);
  }

  async getItemContent(accessToken: string, itemId: string): Promise<string> {
    const item = await this.getItem(accessToken, itemId);
    return item.content;
  }

  async testConnection(accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${GITHUB_API_URL}/user`, {
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
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  private async listRepositories(
    accessToken: string,
    options: ListOptions
  ): Promise<GitHubRepo[]> {
    const params = new URLSearchParams({
      sort: 'updated',
      direction: 'desc',
      per_page: String(options.limit ?? 30),
    });

    if (options.cursor) {
      params.set('page', options.cursor);
    }

    const response = await fetch(`${GITHUB_API_URL}/user/repos?${params.toString()}`, {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error('Failed to list repositories');
    }

    return response.json();
  }

  private async getRepoContent(
    accessToken: string,
    repo: GitHubRepo
  ): Promise<ExternalItem[]> {
    const items: ExternalItem[] = [];
    const [owner, repoName] = repo.full_name.split('/');

    // Always try to get README
    try {
      const readme = await this.getFile(accessToken, owner, repoName, 'README.md');
      items.push(readme);
    } catch {
      // Try README without extension
      try {
        const readme = await this.getFile(accessToken, owner, repoName, 'README');
        items.push(readme);
      } catch {
        // No README found
      }
    }

    // Get root directory contents
    try {
      const contents = await this.listDirectory(accessToken, owner, repoName, '');

      for (const file of contents) {
        if (file.type === 'file' && this.isReadableFile(file.name)) {
          try {
            const item = await this.getFile(accessToken, owner, repoName, file.path);
            items.push(item);
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip if can't list directory
    }

    return items;
  }

  private async listDirectory(
    accessToken: string,
    owner: string,
    repo: string,
    path: string
  ): Promise<GitHubContent[]> {
    const url = path
      ? `${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`
      : `${GITHUB_API_URL}/repos/${owner}/${repo}/contents`;

    const response = await fetch(url, {
      headers: this.getHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(`Failed to list directory: ${path}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  }

  private async getFile(
    accessToken: string,
    owner: string,
    repo: string,
    path: string
  ): Promise<ExternalItem> {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/contents/${path}`,
      {
        headers: this.getHeaders(accessToken),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get file: ${path}`);
    }

    const file: GitHubContent = await response.json();

    let content = '';
    if (file.content && file.encoding === 'base64') {
      content = Buffer.from(file.content, 'base64').toString('utf-8');
    } else if (file.download_url) {
      const downloadResponse = await fetch(file.download_url);
      if (downloadResponse.ok) {
        content = await downloadResponse.text();
      }
    }

    return {
      id: `${owner}/${repo}/${path}`,
      path: `${owner}/${repo}/${path}`,
      title: file.name,
      content,
      mimeType: this.getMimeType(file.name),
      sourceUrl: file.html_url,
      modifiedAt: new Date(), // GitHub doesn't provide file modification time in this API
      metadata: {
        sha: file.sha,
        size: file.size,
        repo: `${owner}/${repo}`,
      },
    };
  }

  private async getIssue(
    accessToken: string,
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<ExternalItem> {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${repo}/issues/${issueNumber}`,
      {
        headers: this.getHeaders(accessToken),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get issue: ${issueNumber}`);
    }

    const issue: GitHubIssue = await response.json();

    const content = [
      `# ${issue.title}`,
      '',
      `**State:** ${issue.state}`,
      `**Author:** @${issue.user.login}`,
      issue.labels.length > 0
        ? `**Labels:** ${issue.labels.map((l) => l.name).join(', ')}`
        : '',
      '',
      issue.body ?? '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      id: `${owner}/${repo}/issues/${issueNumber}`,
      path: `${owner}/${repo}/issues/${issueNumber}`,
      title: issue.title,
      content,
      mimeType: 'text/markdown',
      sourceUrl: issue.html_url,
      createdAt: new Date(issue.created_at),
      modifiedAt: new Date(issue.updated_at),
      metadata: {
        state: issue.state,
        labels: issue.labels.map((l) => l.name),
        author: issue.user.login,
        isPullRequest: !!issue.pull_request,
        repo: `${owner}/${repo}`,
      },
    };
  }

  private isReadableFile(filename: string): boolean {
    const lower = filename.toLowerCase();
    return READABLE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();

    const mimeTypes: Record<string, string> = {
      md: 'text/markdown',
      txt: 'text/plain',
      json: 'application/json',
      yml: 'text/yaml',
      yaml: 'text/yaml',
      js: 'text/javascript',
      ts: 'text/typescript',
      py: 'text/x-python',
      go: 'text/x-go',
      rs: 'text/x-rust',
      java: 'text/x-java',
      rb: 'text/x-ruby',
      html: 'text/html',
      css: 'text/css',
      sql: 'text/x-sql',
    };

    return mimeTypes[ext ?? ''] ?? 'text/plain';
  }
}

// =============================================================================
// Registration
// =============================================================================

registerConnector('github', (supabase, config) => new GitHubConnector(supabase, config));

export function createGitHubConnector(
  supabase: SupabaseClient,
  config?: Partial<ConnectorConfig>
): GitHubConnector {
  const fullConfig: ConnectorConfig = {
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    redirectUri: process.env.GITHUB_REDIRECT_URI ?? '',
    scopes: ['repo', 'read:user', 'user:email'],
    ...config,
  };

  return new GitHubConnector(supabase, fullConfig);
}
