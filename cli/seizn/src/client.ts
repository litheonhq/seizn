/**
 * Seizn CLI - HTTP Client
 *
 * Initializes the API client using SEIZN_API_KEY env variable.
 */

import chalk from 'chalk';

const DEFAULT_BASE_URL = 'https://www.seizn.com/api';

export interface CLIClient {
  request<T>(path: string, options?: { method?: string; body?: unknown; params?: Record<string, string> }): Promise<T>;
}

export function createCLIClient(): CLIClient {
  const apiKey = process.env.SEIZN_API_KEY;
  if (!apiKey) {
    console.error(chalk.red('Error: SEIZN_API_KEY environment variable is required'));
    console.error(chalk.dim('Set it with: export SEIZN_API_KEY=szn_...'));
    process.exit(1);
  }

  const baseUrl = process.env.SEIZN_BASE_URL ?? DEFAULT_BASE_URL;

  return {
    async request<T>(
      path: string,
      options?: { method?: string; body?: unknown; params?: Record<string, string> }
    ): Promise<T> {
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
