/**
 * Seizn CLI - HTTP Client
 *
 * Initializes the API client using SEIZN_API_KEY or `seizn login` credentials.
 */

import chalk from 'chalk';
import { DEFAULT_BASE_URL as DEFAULT_SITE_BASE_URL, loadCredentials, normalizeBaseUrl } from './config-store.js';

const DEFAULT_API_BASE_URL = `${DEFAULT_SITE_BASE_URL}/api`;

export interface CLIClient {
  request<T>(path: string, options?: { method?: string; body?: unknown; params?: Record<string, string> }): Promise<T>;
}

export function createCLIClient(): CLIClient {
  let resolvedAuth: Promise<{ apiKey: string; baseUrl: string }> | null = null;

  async function resolveAuth() {
    resolvedAuth ||= (async () => {
      const credentials = await loadCredentials();
      const apiKey = process.env.SEIZN_API_KEY?.trim() || credentials?.token;
      if (!apiKey) {
        console.error(chalk.red('Error: SEIZN_API_KEY environment variable or `seizn login` credentials are required'));
        console.error(chalk.dim('Run: seizn login'));
        process.exit(1);
      }

      const configuredBaseUrl =
        process.env.SEIZN_BASE_URL?.trim() ||
        credentials?.baseUrl ||
        DEFAULT_API_BASE_URL;
      const normalizedBaseUrl = normalizeBaseUrl(configuredBaseUrl);
      const baseUrl = normalizedBaseUrl.endsWith('/api')
        ? normalizedBaseUrl
        : `${normalizedBaseUrl}/api`;

      return { apiKey, baseUrl };
    })();
    return resolvedAuth;
  }

  return {
    async request<T>(
      path: string,
      options?: { method?: string; body?: unknown; params?: Record<string, string> }
    ): Promise<T> {
      const { apiKey, baseUrl } = await resolveAuth();
      const method = options?.method ?? 'GET';
      let url = `${baseUrl}${path}`;

      if (options?.params) {
        const searchParams = new URLSearchParams(options.params);
        url += `?${searchParams}`;
      }

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.error?.message ?? errorData.message ?? `Request failed (${response.status})`;
        throw new Error(message);
      }

      return response.json();
    },
  };
}
