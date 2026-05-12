// Webhook delivery service for Seizn

import crypto from 'crypto';
import dns from 'dns/promises';
import http from 'http';
import https from 'https';
import { isIP } from 'net';
import type { IncomingMessage, RequestOptions } from 'http';
import type { LookupFunction } from 'net';
import { createServerClient } from './supabase';

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: string;
  attempt_count: number;
  max_attempts: number;
}

interface WebhookConfig {
  id: string;
  url: string;
  secret: string | null;
  is_active?: boolean;
}

export interface ValidatedWebhookEndpoint {
  url: URL;
  hostname: string;
  pinnedIp: string;
  family: 4 | 6;
}

export interface WebhookHttpResponse {
  ok: boolean;
  status: number;
  body: string;
}

export interface ValidatedWebhookRequestInit {
  method?: string;
  headers?: HeadersInit;
  body?: string | URLSearchParams | Uint8Array | null;
}

interface Ipv4Cidr {
  base: number;
  prefix: number;
}

interface Ipv6Cidr {
  base: number[];
  prefix: number;
}

// Generate HMAC signature for webhook payload
export function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function ipv4ToUint32(ip: string): number | null {
  if (isIP(ip) !== 4) return null;

  const parts = ip.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }

  return (
    parts[0] * 2 ** 24 +
    parts[1] * 2 ** 16 +
    parts[2] * 2 ** 8 +
    parts[3]
  ) >>> 0;
}

function ipv4Cidr(base: string, prefix: number): Ipv4Cidr {
  const parsedBase = ipv4ToUint32(base);
  if (parsedBase === null) {
    throw new Error(`Invalid IPv4 CIDR base: ${base}`);
  }

  return { base: parsedBase, prefix };
}

const BLOCKED_IPV4_RANGES: readonly Ipv4Cidr[] = [
  ipv4Cidr('0.0.0.0', 8),
  ipv4Cidr('10.0.0.0', 8),
  ipv4Cidr('100.64.0.0', 10),
  ipv4Cidr('127.0.0.0', 8),
  ipv4Cidr('169.254.0.0', 16),
  ipv4Cidr('172.16.0.0', 12),
  ipv4Cidr('192.0.0.0', 24),
  ipv4Cidr('192.0.2.0', 24),
  ipv4Cidr('192.88.99.0', 24),
  ipv4Cidr('192.168.0.0', 16),
  ipv4Cidr('198.18.0.0', 15),
  ipv4Cidr('198.51.100.0', 24),
  ipv4Cidr('203.0.113.0', 24),
  ipv4Cidr('224.0.0.0', 4),
  ipv4Cidr('240.0.0.0', 4),
];

function ipv4MatchesCidr(ip: number, range: Ipv4Cidr): boolean {
  const mask = range.prefix === 0 ? 0 : (0xffffffff << (32 - range.prefix)) >>> 0;
  return (ip & mask) === (range.base & mask);
}

function parseIpv6Groups(ip: string): number[] | null {
  let normalized = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(normalized) !== 6 || normalized.includes('%')) return null;

  if (normalized.includes('.')) {
    const lastColonIndex = normalized.lastIndexOf(':');
    const mappedIpv4 = normalized.slice(lastColonIndex + 1);
    const mappedInt = ipv4ToUint32(mappedIpv4);
    if (mappedInt === null) return null;

    normalized = `${normalized.slice(0, lastColonIndex)}:${((mappedInt >>> 16) & 0xffff).toString(
      16
    )}:${(mappedInt & 0xffff).toString(16)}`;
  }

  const doubleColonParts = normalized.split('::');
  if (doubleColonParts.length > 2) return null;

  const parsePart = (part: string): number[] => {
    if (!part) return [];
    return part.split(':').map((group) => {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return Number.NaN;
      return Number.parseInt(group, 16);
    });
  };

  const head = parsePart(doubleColonParts[0]);
  const tail = doubleColonParts.length === 2 ? parsePart(doubleColonParts[1]) : [];
  if (
    head.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff) ||
    tail.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)
  ) {
    return null;
  }

  if (doubleColonParts.length === 1) {
    return head.length === 8 ? head : null;
  }

  const missingGroups = 8 - head.length - tail.length;
  if (missingGroups < 1) return null;

  return [...head, ...Array.from({ length: missingGroups }, () => 0), ...tail];
}

function ipv6Cidr(base: string, prefix: number): Ipv6Cidr {
  const parsedBase = parseIpv6Groups(base);
  if (!parsedBase) {
    throw new Error(`Invalid IPv6 CIDR base: ${base}`);
  }

  return { base: parsedBase, prefix };
}

const BLOCKED_IPV6_RANGES: readonly Ipv6Cidr[] = [
  ipv6Cidr('::', 128),
  ipv6Cidr('::1', 128),
  ipv6Cidr('::', 96),
  ipv6Cidr('::ffff:0:0', 96),
  ipv6Cidr('64:ff9b::', 96),
  ipv6Cidr('64:ff9b:1::', 48),
  ipv6Cidr('100::', 64),
  ipv6Cidr('100:0:0:1::', 64),
  ipv6Cidr('2001::', 23),
  ipv6Cidr('2001:db8::', 32),
  ipv6Cidr('2002::', 16),
  ipv6Cidr('3fff::', 20),
  ipv6Cidr('5f00::', 16),
  ipv6Cidr('fc00::', 7),
  ipv6Cidr('fe80::', 10),
  ipv6Cidr('fec0::', 10),
  ipv6Cidr('ff00::', 8),
];

function ipv6MatchesCidr(groups: number[], range: Ipv6Cidr): boolean {
  let remainingBits = range.prefix;

  for (let i = 0; i < 8; i++) {
    if (remainingBits <= 0) return true;

    if (remainingBits >= 16) {
      if (groups[i] !== range.base[i]) return false;
      remainingBits -= 16;
      continue;
    }

    const mask = (0xffff << (16 - remainingBits)) & 0xffff;
    return (groups[i] & mask) === (range.base[i] & mask);
  }

  return true;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function isBlockedLocalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === 'localhost.localdomain' ||
    hostname.endsWith('.localhost')
  );
}

function isBlockedIp(ip: string): boolean {
  const normalized = normalizeHostname(ip);
  const ipKind = isIP(normalized);

  if (ipKind === 4) {
    const parsedIp = ipv4ToUint32(normalized);
    if (parsedIp === null) return true;
    return BLOCKED_IPV4_RANGES.some((range) => ipv4MatchesCidr(parsedIp, range));
  }

  if (ipKind === 6) {
    const groups = parseIpv6Groups(normalized);
    if (!groups) return true;
    return BLOCKED_IPV6_RANGES.some((range) => ipv6MatchesCidr(groups, range));
  }

  return true;
}

function getIpFamily(ip: string): 4 | 6 | null {
  const family = isIP(normalizeHostname(ip));
  return family === 4 || family === 6 ? family : null;
}

async function resolveWebhookHostname(hostname: string): Promise<string[]> {
  const [addresses4, addresses6] = await Promise.all([
    dns.resolve4(hostname).catch(() => [] as string[]),
    dns.resolve6(hostname).catch(() => [] as string[]),
  ]);
  return Array.from(new Set([...addresses4, ...addresses6].filter((ip) => getIpFamily(ip) !== null)));
}

/** Validate webhook URL and block private/internal IPs (SSRF prevention). */
export function isValidWebhookUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    const protocol = url.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;

    const host = normalizeHostname(url.hostname);
    if (!host || isBlockedLocalHostname(host)) return false;

    if (isIP(host) !== 0 && isBlockedIp(host)) return false;

    return true;
  } catch {
    return false;
  }
}

export async function validateWebhookEndpoint(urlString: string): Promise<ValidatedWebhookEndpoint | null> {
  if (!isValidWebhookUrl(urlString)) return null;

  const url = new URL(urlString);
  const hostname = normalizeHostname(url.hostname);
  const directIpFamily = getIpFamily(hostname);

  if (directIpFamily !== null) {
    if (isBlockedIp(hostname)) return null;
    return {
      url,
      hostname,
      pinnedIp: hostname,
      family: directIpFamily,
    };
  }

  const resolvedIps = await resolveWebhookHostname(hostname);
  if (resolvedIps.length === 0) return null;
  if (resolvedIps.some((ip) => isBlockedIp(ip))) return null;

  const pinnedIp = resolvedIps[0];
  const family = getIpFamily(pinnedIp);
  if (family === null) return null;

  return {
    url,
    hostname,
    pinnedIp,
    family,
  };
}

function createPinnedLookup(endpoint: ValidatedWebhookEndpoint): LookupFunction {
  return (hostname, options, callback) => {
    if (normalizeHostname(hostname) !== endpoint.hostname) {
      const error = new Error('Pinned DNS lookup rejected unexpected hostname') as NodeJS.ErrnoException;
      error.code = 'ENOTFOUND';
      callback(error, '', endpoint.family);
      return;
    }

    if (options.all) {
      callback(null, [{ address: endpoint.pinnedIp, family: endpoint.family }]);
      return;
    }

    callback(null, endpoint.pinnedIp, endpoint.family);
  };
}

function readResponseBody(response: IncomingMessage, maxChars = 500): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    response.setEncoding('utf8');
    response.on('data', (chunk: string) => {
      if (body.length >= maxChars) return;
      body += chunk.slice(0, maxChars - body.length);
    });
    response.on('end', () => resolve(body));
    response.on('error', reject);
  });
}

function normalizeRequestHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const normalized: Record<string, string> = {};
  if (!headers) return normalized;

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key] = value;
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      normalized[key] = value;
    }
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    normalized[key] = value;
  }
  return normalized;
}

function requestBodyToBuffer(body: ValidatedWebhookRequestInit['body']): Buffer | null {
  if (body == null) return null;
  if (typeof body === 'string') return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  return Buffer.from(body);
}

function sendPinnedHttpRequest(
  endpoint: ValidatedWebhookEndpoint,
  init: ValidatedWebhookRequestInit,
  timeoutMs: number
): Promise<WebhookHttpResponse> {
  return new Promise((resolve, reject) => {
    const bodyBuffer = requestBodyToBuffer(init.body);
    const requestHeaders: Record<string, string> = {
      ...normalizeRequestHeaders(init.headers),
    };
    if (bodyBuffer) {
      requestHeaders['Content-Length'] = bodyBuffer.byteLength.toString();
    }

    const options: RequestOptions = {
      protocol: endpoint.url.protocol,
      hostname: endpoint.hostname,
      port: endpoint.url.port || undefined,
      path: `${endpoint.url.pathname}${endpoint.url.search}`,
      method: init.method ?? 'GET',
      headers: requestHeaders,
      lookup: createPinnedLookup(endpoint),
    };

    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const handleResponse = (response: IncomingMessage) => {
      readResponseBody(response)
        .then((responseBody) => {
          const status = response.statusCode ?? 0;
          settle(() =>
            resolve({
              ok: status >= 200 && status < 300,
              status,
              body: responseBody,
            })
          );
        })
        .catch((error: unknown) => settle(() => reject(error)));
    };

    const request =
      endpoint.url.protocol === 'https:'
        ? https.request(
            {
              ...options,
              servername: isIP(endpoint.hostname) === 0 ? endpoint.hostname : undefined,
            },
            handleResponse
          )
        : http.request(options, handleResponse);

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Webhook request timed out'));
    });

    request.on('error', (error) => settle(() => reject(error)));
    request.end(bodyBuffer ?? undefined);
  });
}

export async function requestValidatedWebhookEndpoint(
  urlString: string,
  init: ValidatedWebhookRequestInit = {},
  timeoutMs = 10000
): Promise<WebhookHttpResponse> {
  const endpoint = await validateWebhookEndpoint(urlString);
  if (!endpoint) {
    throw new Error('Outbound URL blocked by SSRF policy');
  }

  return sendPinnedHttpRequest(endpoint, init, timeoutMs);
}

// Deliver a single webhook
export async function deliverWebhook(
  delivery: WebhookDelivery,
  webhook: WebhookConfig
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const payloadString = JSON.stringify(delivery.payload);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Seizn-Event': delivery.event_type,
    'X-Seizn-Delivery': delivery.id,
    'X-Seizn-Timestamp': new Date().toISOString(),
  };

  // Add signature if secret is configured
  if (webhook.secret) {
    headers['X-Seizn-Signature'] = `sha256=${generateSignature(payloadString, webhook.secret)}`;
  }

  // Resolve and pin the delivery socket to a validated public IP to reduce DNS rebinding TOCTOU risk.
  const endpoint = await validateWebhookEndpoint(webhook.url);
  if (!endpoint) {
    return { success: false, error: 'Webhook URL blocked by SSRF policy' };
  }

  try {
    const response = await sendPinnedHttpRequest(
      endpoint,
      { method: 'POST', headers, body: payloadString },
      10000
    );

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : response.body.slice(0, 500),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Process pending webhook deliveries
export async function processPendingWebhooks(limit: number = 50): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const supabase = createServerClient();

  // Get pending deliveries
  const { data: deliveries, error: fetchError } = await supabase
    .from('webhook_deliveries')
    .select(`
      id,
      webhook_id,
      event_type,
      payload,
      status,
      attempt_count,
      max_attempts,
      webhooks!inner (
        id,
        url,
        secret,
        is_active
      )
    `)
    .or('status.eq.pending,and(status.eq.failed,attempt_count.lt.max_attempts,next_retry_at.lte.now())')
    .limit(limit);

  if (fetchError || !deliveries) {
    console.error('Failed to fetch webhook deliveries:', fetchError);
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const webhook = (delivery as unknown as { webhooks: WebhookConfig }).webhooks;

    // Skip if webhook is inactive
    if (!webhook?.is_active) {
      continue;
    }

    const result = await deliverWebhook(
      delivery as WebhookDelivery,
      webhook as WebhookConfig
    );

    const newAttemptCount = delivery.attempt_count + 1;

    if (result.success) {
      // Mark as succeeded
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'success',
          status_code: result.statusCode,
          attempt_count: newAttemptCount,
          delivered_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);

      succeeded++;
    } else {
      // Mark as failed or schedule retry
      const isFinalAttempt = newAttemptCount >= delivery.max_attempts;

      // Exponential backoff: 1min, 5min, 30min
      const retryDelays = [60, 300, 1800];
      const retryDelay = retryDelays[Math.min(newAttemptCount - 1, retryDelays.length - 1)];

      await supabase
        .from('webhook_deliveries')
        .update({
          status: isFinalAttempt ? 'failed' : 'pending',
          status_code: result.statusCode,
          error_message: result.error,
          attempt_count: newAttemptCount,
          next_retry_at: isFinalAttempt
            ? null
            : new Date(Date.now() + retryDelay * 1000).toISOString(),
        })
        .eq('id', delivery.id);

      failed++;
    }
  }

  return {
    processed: deliveries.length,
    succeeded,
    failed,
  };
}

// Get webhook delivery history for a webhook
export async function getDeliveryHistory(
  webhookId: string,
  limit: number = 20
): Promise<WebhookDelivery[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('webhook_deliveries')
    .select('*')
    .eq('webhook_id', webhookId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to fetch delivery history:', error);
    return [];
  }

  return data || [];
}
