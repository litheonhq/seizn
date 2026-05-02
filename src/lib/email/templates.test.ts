import { describe, expect, it } from 'vitest';
import { enterpriseInquiryConfirmationEmail } from './templates';

describe('enterpriseInquiryConfirmationEmail', () => {
  it('escapes enterprise inquiry fields in HTML and preview text', () => {
    const html = enterpriseInquiryConfirmationEmail(
      '<img src=x onerror=alert(1)>',
      '<script>alert(1)</script>'
    );

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
