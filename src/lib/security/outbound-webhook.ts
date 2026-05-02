import {
  validateOutboundUrl,
  type OutboundUrlValidationOptions,
} from './outbound-url';

export interface OutboundWebhookValidationOptions
  extends Pick<OutboundUrlValidationOptions, 'allowHttp' | 'allowedHosts' | 'resolveDns'> {
  label?: string;
}

export interface OutboundWebhookValidationResult {
  ok: boolean;
  reason?: string;
  url?: string;
}

export async function validateOutboundWebhookUrl(
  value: unknown,
  options: OutboundWebhookValidationOptions = {}
): Promise<OutboundWebhookValidationResult> {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false, reason: 'Missing webhook URL' };
  }

  const result = await validateOutboundUrl(value.trim(), {
    allowHttp: options.allowHttp,
    allowedHosts: options.allowedHosts,
    resolveDns: options.resolveDns,
  });

  if (!result.valid) {
    return { ok: false, reason: result.reason ?? 'Unsafe outbound webhook URL' };
  }

  return { ok: true, url: result.normalizedUrl ?? value.trim() };
}

export async function normalizeOutboundWebhookUrl(
  value: unknown,
  options: OutboundWebhookValidationOptions = {}
): Promise<string | null> {
  const result = await validateOutboundWebhookUrl(value, options);
  if (result.ok) return result.url ?? null;

  const label = options.label ?? 'Outbound webhook URL';
  console.warn(`[Security] ${label} rejected: ${result.reason}`);
  return null;
}
