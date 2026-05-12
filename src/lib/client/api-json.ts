'use client';

import { getErrorMessage } from '@/lib/ui-error';

export class ApiJsonResponseError extends Error {
  readonly status: number;
  readonly contentType: string;
  readonly bodyPreview: string;

  constructor(message: string, response: Response, bodyText: string) {
    super(message);
    this.name = 'ApiJsonResponseError';
    this.status = response.status;
    this.contentType = response.headers.get('content-type') ?? '';
    this.bodyPreview = bodyText.replace(/\s+/g, ' ').trim().slice(0, 160);
  }
}

function isHtmlResponse(response: Response, bodyText: string): boolean {
  const contentType = response.headers.get('content-type') ?? '';
  const trimmed = bodyText.trimStart().toLowerCase();
  return (
    contentType.includes('text/html') ||
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<script')
  );
}

function nonJsonMessage(response: Response, bodyText: string, fallback: string): string {
  if (response.status === 401) {
    return 'Your session expired. Refresh the page and sign in again.';
  }
  if (isHtmlResponse(response, bodyText)) {
    return `${fallback}. The server returned an HTML page instead of JSON. Refresh the page and try again.`;
  }
  return fallback;
}

export async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  const bodyText = await response.text();
  let payload: unknown = null;

  if (!bodyText.trim()) {
    throw new ApiJsonResponseError(
      response.ok ? `${fallback}. The server returned an empty response.` : fallback,
      response,
      bodyText,
    );
  }

  try {
    payload = JSON.parse(bodyText);
  } catch {
    throw new ApiJsonResponseError(
      nonJsonMessage(response, bodyText, fallback),
      response,
      bodyText,
    );
  }

  if (!response.ok) {
    throw new ApiJsonResponseError(getErrorMessage(payload, fallback), response, bodyText);
  }

  return payload as T;
}
