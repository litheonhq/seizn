import { describe, expect, it } from 'vitest';
import { validateOutboundWebhookUrl } from './outbound-webhook';

describe('validateOutboundWebhookUrl', () => {
  it('accepts public HTTPS webhook URLs', async () => {
    const result = await validateOutboundWebhookUrl(
      'https://hooks.slack.com/services/T000/B000/secret',
      { resolveDns: false }
    );

    expect(result.ok).toBe(true);
    expect(result.url).toContain('https://hooks.slack.com');
  });

  it('rejects localhost and private network targets', async () => {
    const localhost = await validateOutboundWebhookUrl('https://localhost/hook', {
      resolveDns: false,
    });
    const privateIp = await validateOutboundWebhookUrl('https://10.0.0.5/hook', {
      resolveDns: false,
    });

    expect(localhost.ok).toBe(false);
    expect(privateIp.ok).toBe(false);
  });

  it('rejects non-HTTPS webhook URLs by default', async () => {
    const result = await validateOutboundWebhookUrl('http://example.com/hook', {
      resolveDns: false,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('HTTPS');
  });

  it('rejects URLs containing credentials', async () => {
    const result = await validateOutboundWebhookUrl('https://user:pass@example.com/hook', {
      resolveDns: false,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('credentials');
  });
});
