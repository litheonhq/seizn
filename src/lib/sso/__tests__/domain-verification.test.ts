import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('dns/promises', () => {
  const api = {
    resolveTxt: vi.fn(),
    resolveCname: vi.fn(),
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  };
  return { __esModule: true, default: api, ...api };
});

import * as dns from 'dns/promises';
import { verifyDomainOwnership, isPrivateOrReservedIp } from '../domain-verification';

type MockedDns = {
  resolveTxt: ReturnType<typeof vi.fn>;
  resolveCname: ReturnType<typeof vi.fn>;
  resolve4: ReturnType<typeof vi.fn>;
  resolve6: ReturnType<typeof vi.fn>;
};

const mockedDns = dns as unknown as MockedDns;

describe('sso domain verification', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockedDns.resolveTxt.mockReset();
    mockedDns.resolveCname.mockReset();
    mockedDns.resolve4.mockReset();
    mockedDns.resolve6.mockReset();

    global.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('verifies dns_txt when token is present (including chunked TXT records)', async () => {
    mockedDns.resolveTxt.mockResolvedValueOnce([
      ['hello'],
      ['seizn-', 'verify=', 'abc123'],
    ]);

    const ok = await verifyDomainOwnership('example.com', 'seizn-verify=abc123', 'dns_txt');
    expect(ok).toBe(true);
  });

  it('verifies dns_cname when CNAME points to verify.seizn.com and root TXT contains token', async () => {
    mockedDns.resolveCname.mockResolvedValueOnce(['verify.seizn.com.']);
    mockedDns.resolveTxt.mockResolvedValueOnce([
      ['v=spf1 include:_spf.example.com ~all'],
      ['seizn-verify=tok'],
    ]);

    const ok = await verifyDomainOwnership('example.com', 'seizn-verify=tok', 'dns_cname');
    expect(ok).toBe(true);
  });

  it('returns false for meta_tag when the host resolves to private IPs (SSRF guard)', async () => {
    mockedDns.resolve4.mockResolvedValueOnce(['127.0.0.1']);
    mockedDns.resolve6.mockResolvedValueOnce([]);
    mockedDns.resolve4.mockResolvedValueOnce([]);
    mockedDns.resolve6.mockResolvedValueOnce([]);

    const ok = await verifyDomainOwnership('example.com', 'seizn-verify=abc', 'meta_tag');
    expect(ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('detects private/reserved IP ranges', () => {
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedIp('::1')).toBe(true);
    expect(isPrivateOrReservedIp('fd00::1')).toBe(true);
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false);
  });
});
