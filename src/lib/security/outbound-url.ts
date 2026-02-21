import dns from 'dns/promises';
import { isIP } from 'net';
import { isPrivateOrReservedIp } from '@/lib/sso/domain-verification';

export interface OutboundUrlValidationOptions {
  allowHttp?: boolean;
  allowPrivateNetwork?: boolean;
  resolveDns?: boolean;
  allowedHosts?: string[];
}

export interface OutboundUrlValidationResult {
  valid: boolean;
  reason?: string;
  normalizedUrl?: string;
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    const normalized = normalizeHost(entry);
    if (!normalized) return false;
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1); // keep leading dot
      return host.endsWith(suffix);
    }
    return host === normalized;
  });
}

function isBlockedLocalHost(host: string): boolean {
  return host === 'localhost' || host === 'localhost.localdomain';
}

async function resolveHostIps(hostname: string): Promise<string[]> {
  const v4 = await dns.resolve4(hostname).catch(() => [] as string[]);
  const v6 = await dns.resolve6(hostname).catch(() => [] as string[]);
  return [...v4, ...v6];
}

/**
 * Validate outbound URL to reduce SSRF risk.
 */
export async function validateOutboundUrl(
  value: string,
  options: OutboundUrlValidationOptions = {}
): Promise<OutboundUrlValidationResult> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  const protocol = url.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { valid: false, reason: 'Only http/https URLs are allowed' };
  }

  const allowHttp = options.allowHttp === true;
  if (protocol === 'http:' && !allowHttp) {
    return { valid: false, reason: 'Only HTTPS is allowed for outbound URL' };
  }

  if (url.username || url.password) {
    return { valid: false, reason: 'Outbound URL must not contain credentials' };
  }

  const host = normalizeHost(url.hostname);
  if (!host) {
    return { valid: false, reason: 'Missing hostname' };
  }

  const allowPrivateNetwork = options.allowPrivateNetwork === true;
  if (!allowPrivateNetwork && isBlockedLocalHost(host)) {
    return { valid: false, reason: 'Localhost is not allowed' };
  }

  if (options.allowedHosts?.length && !hostMatchesAllowlist(host, options.allowedHosts)) {
    return { valid: false, reason: 'Hostname is not in allowlist' };
  }

  const hostIpType = isIP(host);
  if (!allowPrivateNetwork && hostIpType !== 0 && isPrivateOrReservedIp(host)) {
    return { valid: false, reason: 'Private or reserved IP is not allowed' };
  }

  const shouldResolveDns = options.resolveDns ?? process.env.NODE_ENV === 'production';
  if (!allowPrivateNetwork && shouldResolveDns && hostIpType === 0) {
    const resolvedIps = await resolveHostIps(host);
    if (resolvedIps.length === 0) {
      return { valid: false, reason: 'Hostname resolution failed' };
    }

    for (const ip of resolvedIps) {
      if (isPrivateOrReservedIp(ip)) {
        return { valid: false, reason: 'Hostname resolves to private/reserved IP' };
      }
    }
  }

  return {
    valid: true,
    normalizedUrl: url.toString(),
  };
}

