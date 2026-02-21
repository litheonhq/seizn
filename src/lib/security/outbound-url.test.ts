import { describe, expect, it } from 'vitest';
import { validateOutboundUrl } from './outbound-url';

describe('validateOutboundUrl', () => {
  it('accepts standard https URLs', async () => {
    const result = await validateOutboundUrl('https://api.openai.com/v1/chat/completions', {
      resolveDns: false,
    });

    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toContain('https://api.openai.com');
  });

  it('rejects http URLs by default', async () => {
    const result = await validateOutboundUrl('http://example.com', { resolveDns: false });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('HTTPS');
  });

  it('rejects localhost and private IP targets by default', async () => {
    const localhost = await validateOutboundUrl('https://localhost:3000', { resolveDns: false });
    const privateIp = await validateOutboundUrl('https://10.0.0.5', { resolveDns: false });

    expect(localhost.valid).toBe(false);
    expect(privateIp.valid).toBe(false);
  });

  it('allows private targets when explicitly enabled', async () => {
    const result = await validateOutboundUrl('http://localhost:3000', {
      allowHttp: true,
      allowPrivateNetwork: true,
      resolveDns: false,
    });

    expect(result.valid).toBe(true);
  });

  it('rejects URL credentials', async () => {
    const result = await validateOutboundUrl('https://user:pass@example.com/path', {
      resolveDns: false,
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('credentials');
  });

  it('enforces allowlist when provided', async () => {
    const denied = await validateOutboundUrl('https://api.openai.com/v1', {
      allowedHosts: ['*.example.com'],
      resolveDns: false,
    });
    const allowed = await validateOutboundUrl('https://sub.example.com/v1', {
      allowedHosts: ['*.example.com'],
      resolveDns: false,
    });

    expect(denied.valid).toBe(false);
    expect(allowed.valid).toBe(true);
  });
});

