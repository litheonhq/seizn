import * as crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from '../utils';

const SECRET = 'whsec_test_secret_value_for_unit_tests_only';

function buildHeader(payload: string, secret: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${payload}`;
  const v1 = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

describe('verifyStripeSignature', () => {
  it('accepts a freshly signed payload', () => {
    const payload = '{"id":"evt_1","type":"customer.created"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = buildHeader(payload, SECRET, ts);
    expect(verifyStripeSignature(payload, header, SECRET)).toBe(true);
  });

  it('rejects when the signature does not match the secret', () => {
    const payload = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = buildHeader(payload, SECRET, ts);
    expect(verifyStripeSignature(payload, header, 'whsec_wrong_secret')).toBe(false);
  });

  it('rejects when the payload was tampered with', () => {
    const payload = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000);
    const header = buildHeader(payload, SECRET, ts);
    const tampered = '{"id":"evt_2"}';
    expect(verifyStripeSignature(tampered, header, SECRET)).toBe(false);
  });

  it('rejects when timestamp is older than the 5-minute tolerance', () => {
    const payload = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000) - 600; // 10 min old
    const header = buildHeader(payload, SECRET, ts);
    expect(verifyStripeSignature(payload, header, SECRET)).toBe(false);
  });

  it('rejects when timestamp is more than 5 minutes in the future', () => {
    const payload = '{"id":"evt_1"}';
    const ts = Math.floor(Date.now() / 1000) + 600;
    const header = buildHeader(payload, SECRET, ts);
    expect(verifyStripeSignature(payload, header, SECRET)).toBe(false);
  });

  it('rejects when the header is missing the v1 component', () => {
    const ts = Math.floor(Date.now() / 1000);
    expect(verifyStripeSignature('{}', `t=${ts}`, SECRET)).toBe(false);
  });

  it('rejects when the header is missing the timestamp', () => {
    const v1 = crypto.createHmac('sha256', SECRET).update('0.{}').digest('hex');
    expect(verifyStripeSignature('{}', `v1=${v1}`, SECRET)).toBe(false);
  });

  it('rejects an empty header without throwing', () => {
    expect(verifyStripeSignature('{}', '', SECRET)).toBe(false);
  });

  it('rejects a malformed header without throwing', () => {
    expect(verifyStripeSignature('{}', 'gibberish-no-equals', SECRET)).toBe(false);
  });
});
