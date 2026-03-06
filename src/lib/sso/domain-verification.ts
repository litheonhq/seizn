import { resolve4, resolve6, resolveCname, resolveTxt } from 'dns/promises';
import net from 'net';
import { logServerWarn } from '@/lib/server/logger';

const TXT_HOST_PREFIX = '_seizn-verification.';
const DEFAULT_TIMEOUT_MS = 5000;
const USER_AGENT = 'SeiznDomainVerifier/1.0';

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function joinTxtRecords(records: string[][]): string[] {
  // TXT records may be chunked into multiple strings by DNS resolvers.
  // Re-join fragments so we can compare against the full token.
  return records
    .map((parts) => parts.join(''))
    .map((value) => value.trim())
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const kind = net.isIP(ip);

  if (kind === 4) {
    const parts = ip.split('.').map((p) => Number.parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b] = parts;

    // RFC1918, loopback, link-local, CGNAT, and reserved/multicast ranges.
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;

    return false;
  }

  if (kind === 6) {
    const lower = ip.toLowerCase();

    if (lower === '::' || lower === '::1') return true;
    // Unique local: fc00::/7
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    // Link-local: fe80::/10 (fe8x..febx)
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true;
    }

    // IPv4-mapped IPv6: ::ffff:127.0.0.1
    if (lower.startsWith('::ffff:')) {
      const mapped = lower.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }

    return false;
  }

  // Unknown format: treat as unsafe.
  return true;
}

async function resolveAllIps(hostname: string): Promise<string[]> {
  const ips: string[] = [];

  try {
    ips.push(...(await resolve4(hostname)));
  } catch {
    // ignore
  }

  try {
    ips.push(...(await resolve6(hostname)));
  } catch {
    // ignore
  }

  return ips;
}

async function isPublicHostname(hostname: string): Promise<boolean> {
  const ips = await resolveAllIps(hostname);
  if (ips.length === 0) return false;
  return ips.every((ip) => !isPrivateOrReservedIp(ip));
}

async function verifyDnsTxt(domain: string, token: string): Promise<boolean> {
  const host = `${TXT_HOST_PREFIX}${domain}`;

  try {
    const records = await resolveTxt(host);
    return joinTxtRecords(records).some((txt) => txt.includes(token));
  } catch (error) {
    logServerWarn('[SSO] DNS TXT verification lookup failed', error, {
      domain,
      host,
      code: error && typeof error === 'object' && 'code' in error ? error.code : 'unknown',
    });
    return false;
  }
}

async function verifyDnsCname(domain: string, token: string): Promise<boolean> {
  const host = `${TXT_HOST_PREFIX}${domain}`;

  try {
    const cnames = await resolveCname(host);
    const cnameOk = cnames.some((cname) => {
      const clean = cname.toLowerCase().replace(/\.$/, '');
      return clean === 'verify.seizn.com';
    });

    if (!cnameOk) return false;

    // Token is verified via a root-domain TXT record (does not conflict with the CNAME above).
    const rootTxt = await resolveTxt(domain);
    return joinTxtRecords(rootTxt).some((txt) => txt.includes(token));
  } catch (error) {
    logServerWarn('[SSO] DNS CNAME verification lookup failed', error, {
      domain,
      host,
      code: error && typeof error === 'object' && 'code' in error ? error.code : 'unknown',
    });
    return false;
  }
}

async function fetchHttpsText(
  url: string,
  allowedHosts: string[],
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
      },
    });

    if (!res.ok) return null;

    try {
      const finalUrl = new URL(res.url);
      if (finalUrl.protocol !== 'https:') return null;

      const finalHost = finalUrl.hostname.toLowerCase();
      if (!allowedHosts.includes(finalHost)) return null;
    } catch {
      return null;
    }

    // Limit overly large responses (best-effort).
    const text = await res.text();
    if (text.length > 512_000) {
      return text.slice(0, 512_000);
    }

    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function verifyMetaTag(domain: string, token: string): Promise<boolean> {
  const allowedHosts = [domain, `www.${domain}`].map((h) => h.toLowerCase());

  // Basic SSRF mitigation: only allow public IP targets.
  const hostIsPublic = await Promise.all(allowedHosts.map((h) => isPublicHostname(h)));
  if (!hostIsPublic.some(Boolean)) return false;

  const html =
    (await fetchHttpsText(`https://${domain}/`, allowedHosts, DEFAULT_TIMEOUT_MS)) ||
    (await fetchHttpsText(`https://www.${domain}/`, allowedHosts, DEFAULT_TIMEOUT_MS));
  if (!html) return false;

  const re = new RegExp(
    `<meta\\s+[^>]*name\\s*=\\s*["']seizn-verification["'][^>]*content\\s*=\\s*["']${escapeRegExp(
      token
    )}["'][^>]*>`,
    'i'
  );
  return re.test(html);
}

async function verifyWellKnownFile(domain: string, token: string): Promise<boolean> {
  const allowedHosts = [domain, `www.${domain}`].map((h) => h.toLowerCase());

  const hostIsPublic = await Promise.all(allowedHosts.map((h) => isPublicHostname(h)));
  if (!hostIsPublic.some(Boolean)) return false;

  const path = '/.well-known/seizn-verification.txt';
  const text =
    (await fetchHttpsText(`https://${domain}${path}`, allowedHosts, DEFAULT_TIMEOUT_MS)) ||
    (await fetchHttpsText(`https://www.${domain}${path}`, allowedHosts, DEFAULT_TIMEOUT_MS));
  if (!text) return false;

  return text.trim().includes(token);
}

/**
 * Verify that a domain is owned by an organization (prevent domain hijacking for SSO routing).
 *
 * Supported methods:
 * - dns_txt: TXT record at `_seizn-verification.<domain>` containing the token
 * - dns_cname: CNAME at `_seizn-verification.<domain>` -> `verify.seizn.com` AND root TXT record containing token
 * - meta_tag: HTML meta tag on `https://<domain>/` with the token
 * - file: `https://<domain>/.well-known/seizn-verification.txt` containing the token
 */
export async function verifyDomainOwnership(
  domain: string,
  token: string,
  method: string
): Promise<boolean> {
  const normalizedDomain = normalizeDomain(domain);

  if (!normalizedDomain || !token) return false;

  switch (method) {
    case 'dns_txt':
      return verifyDnsTxt(normalizedDomain, token);
    case 'dns_cname':
      return verifyDnsCname(normalizedDomain, token);
    case 'meta_tag':
      return verifyMetaTag(normalizedDomain, token);
    case 'file':
      return verifyWellKnownFile(normalizedDomain, token);
    default:
      return false;
  }
}
