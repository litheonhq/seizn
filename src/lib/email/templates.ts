function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Base template wrapper
function baseTemplate(content: string, previewText?: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seizn</title>
  ${previewText ? `<span style="display:none;font-size:1px;color:#fff;max-height:0;">${escapeHtml(previewText)}</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #e5e7eb;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="display:inline-flex;align-items:center;gap:8px;">
                      <div style="width:32px;height:32px;background-color:#000;border-radius:8px;display:flex;align-items:center;justify-content:center;">
                        <span style="color:#fff;font-weight:bold;font-size:14px;">S</span>
                      </div>
                      <span style="font-size:20px;font-weight:600;color:#111827;">Seizn</span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:32px 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#6b7280;text-align:center;">
                &copy; ${new Date().getFullYear()} Seizn. All rights reserved.
              </p>
              <p style="margin:8px 0 0;font-size:12px;color:#6b7280;text-align:center;">
                <a href="https://www.seizn.com/privacy" style="color:#6b7280;">Privacy</a> &middot;
                <a href="https://www.seizn.com/terms" style="color:#6b7280;">Terms</a> &middot;
                <a href="https://www.seizn.com" style="color:#6b7280;">seizn.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// Welcome email when user signs up
export function welcomeEmail(name: string) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Welcome to Seizn!</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Thanks for joining Seizn! You now have access to powerful AI memory infrastructure that helps your applications remember everything.
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Here's how to get started:
    </p>
    <ol style="margin:0 0 24px;padding-left:20px;font-size:16px;color:#4b5563;line-height:1.8;">
      <li>Create your first API key in the dashboard</li>
      <li>Install our SDK: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;">npm install seizn</code></li>
      <li>Start adding memories to your AI</li>
    </ol>
    <a href="https://www.seizn.com/dashboard" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      Go to Dashboard
    </a>
  `;
  return baseTemplate(content, 'Welcome to Seizn - AI Memory Infrastructure');
}

// API Key created notification
export function apiKeyCreatedEmail(keyName: string, keyPreview: string) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">New API Key Created</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      A new API key has been created for your Seizn account.
    </p>
    <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Key Name</p>
      <p style="margin:0;font-size:16px;font-weight:500;color:#111827;">${keyName}</p>
      <p style="margin:16px 0 8px;font-size:14px;color:#6b7280;">Key Preview</p>
      <p style="margin:0;font-size:16px;font-family:monospace;color:#111827;">${keyPreview}...</p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#ef4444;">
      If you didn't create this key, please secure your account immediately.
    </p>
    <a href="https://www.seizn.com/dashboard" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View API Keys
    </a>
  `;
  return baseTemplate(content, `New API Key: ${keyName}`);
}

// API Key rotated notification
export function apiKeyRotatedEmail(keyName: string, keyPreview: string) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">API Key Rotated</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Your API key has been rotated. The old key is no longer valid.
    </p>
    <div style="background:#f3f4f6;padding:16px;border-radius:8px;margin:0 0 24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Key Name</p>
      <p style="margin:0;font-size:16px;font-weight:500;color:#111827;">${keyName}</p>
      <p style="margin:16px 0 8px;font-size:14px;color:#6b7280;">New Key Preview</p>
      <p style="margin:0;font-size:16px;font-family:monospace;color:#111827;">${keyPreview}...</p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#f59e0b;">
      Please update your applications with the new key immediately.
    </p>
    <p style="margin:0 0 24px;font-size:14px;color:#ef4444;">
      If you didn't rotate this key, please secure your account immediately.
    </p>
    <a href="https://www.seizn.com/dashboard/keys" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View API Keys
    </a>
  `;
  return baseTemplate(content, `API Key Rotated: ${keyName}`);
}

// Usage alert email
export function usageAlertEmail(
  usagePercent: number,
  planName: string,
  memoriesUsed: number,
  memoriesLimit: number,
  apiCallsUsed: number,
  apiCallsLimit: number
) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Usage Alert: ${usagePercent}% Used</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Your Seizn ${planName} plan is approaching its limits.
    </p>
    <div style="background:#fef3c7;padding:16px;border-radius:8px;margin:0 0 24px;border:1px solid #fcd34d;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;">
            <p style="margin:0;font-size:14px;color:#92400e;">Memories</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#78350f;">${memoriesUsed.toLocaleString()} / ${memoriesLimit.toLocaleString()}</p>
          </td>
          <td style="padding:8px 0;text-align:right;">
            <p style="margin:0;font-size:14px;color:#92400e;">API Calls</p>
            <p style="margin:4px 0 0;font-size:18px;font-weight:600;color:#78350f;">${apiCallsUsed.toLocaleString()} / ${apiCallsLimit.toLocaleString()}</p>
          </td>
        </tr>
      </table>
    </div>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Consider upgrading your plan to avoid service interruptions.
    </p>
    <a href="https://www.seizn.com/pricing" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      Upgrade Plan
    </a>
  `;
  return baseTemplate(content, `Usage Alert: ${usagePercent}% of your ${planName} plan used`);
}

// Organization invite email
export function organizationInviteEmail(
  inviterName: string,
  organizationName: string,
  inviteLink: string
) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">You're Invited!</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on Seizn.
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Click the button below to accept the invitation and start collaborating.
    </p>
    <a href="${inviteLink}" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      Accept Invitation
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      This invitation will expire in 7 days.
    </p>
  `;
  return baseTemplate(content, `${inviterName} invited you to ${organizationName}`);
}

// Password reset email
export function passwordResetEmail(resetLink: string) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Reset Your Password</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      We received a request to reset your password. Click the button below to create a new password.
    </p>
    <a href="${resetLink}" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      Reset Password
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      If you didn't request this, you can safely ignore this email. This link will expire in 1 hour.
    </p>
  `;
  return baseTemplate(content, 'Reset your Seizn password');
}

// Weekly usage summary
export function weeklyUsageSummaryEmail(
  name: string,
  memoriesCount: number,
  apiCallsCount: number,
  topTags: string[]
) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Your Weekly Summary</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${name || 'there'}, here's your Seizn usage for the past week:
    </p>
    <div style="background:#f3f4f6;padding:20px;border-radius:8px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="text-align:center;padding:12px;">
            <p style="margin:0;font-size:32px;font-weight:700;color:#111827;">${memoriesCount.toLocaleString()}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">Memories Created</p>
          </td>
          <td style="text-align:center;padding:12px;border-left:1px solid #e5e7eb;">
            <p style="margin:0;font-size:32px;font-weight:700;color:#111827;">${apiCallsCount.toLocaleString()}</p>
            <p style="margin:4px 0 0;font-size:14px;color:#6b7280;">API Calls</p>
          </td>
        </tr>
      </table>
    </div>
    ${topTags.length > 0 ? `
    <p style="margin:0 0 12px;font-size:16px;color:#4b5563;">Top Tags:</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      ${topTags.map(tag => `<span style="display:inline-block;background:#e5e7eb;padding:4px 12px;border-radius:9999px;margin:4px 4px 4px 0;">${tag}</span>`).join('')}
    </p>
    ` : ''}
    <a href="https://www.seizn.com/dashboard" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View Dashboard
    </a>
  `;
  return baseTemplate(content, `Your weekly Seizn summary: ${memoriesCount} memories, ${apiCallsCount} API calls`);
}

// Enterprise inquiry confirmation
export function enterpriseInquiryConfirmationEmail(companyName: string, contactName: string) {
  const safeCompanyName = escapeHtml(companyName);
  const safeContactName = escapeHtml(contactName);
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">We Received Your Inquiry</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${safeContactName},
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Thank you for your interest in Seizn Enterprise for <strong>${safeCompanyName}</strong>.
      Our team will review your inquiry and get back to you within 1-2 business days.
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      In the meantime, feel free to explore our documentation or try our free tier.
    </p>
    <a href="https://www.seizn.com/docs" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View Documentation
    </a>
  `;
  return baseTemplate(content, `We received your enterprise inquiry for ${companyName}`);
}

// Payment failed notification email
export function paymentFailedEmail(
  name: string,
  amount?: string,
  currency?: string,
  invoiceUrl?: string
) {
  const amountDisplay = amount && currency
    ? `${currency.toUpperCase()} ${(Number(amount) / 100).toFixed(2)}`
    : null;

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Payment Failed</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${name || 'there'},
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      We were unable to process your latest payment${amountDisplay ? ` of <strong>${amountDisplay}</strong>` : ''}. Please update your payment method to avoid any service interruptions.
    </p>
    <div style="background:#fef2f2;padding:16px;border-radius:8px;margin:0 0 24px;border:1px solid #fecaca;">
      <p style="margin:0;font-size:14px;color:#991b1b;">
        Your account access may be restricted if payment is not resolved within 7 days.
      </p>
    </div>
    ${invoiceUrl ? `
    <a href="${invoiceUrl}" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;margin-bottom:12px;">
      View Invoice
    </a>
    <br>` : ''}
    <a href="https://www.seizn.com/dashboard/billing" style="display:inline-block;padding:12px 24px;background-color:#fff;color:#111827;text-decoration:none;border-radius:9999px;font-weight:500;border:1px solid #d1d5db;margin-top:8px;">
      Update Payment Method
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#6b7280;">
      If you believe this is an error, please contact us at <a href="mailto:support@seizn.com" style="color:#4b5563;">support@seizn.com</a>.
    </p>
  `;
  return baseTemplate(content, 'Action required: Your payment failed');
}

// =============================================================================
// W2.5 — added 2026-05-09. signup-confirm, payment-receipt, waitlist-confirm.
// =============================================================================

export type EmailLocale = 'en' | 'ko';

function tBilingual(en: string, ko: string, locale: EmailLocale): string {
  return locale === 'ko' ? ko : en;
}

// Signup email confirmation (free-tier abuse defense per W3.9)
export function signupConfirmEmail(
  name: string,
  confirmLink: string,
  locale: EmailLocale = 'en'
) {
  const safeName = escapeHtml(name || (locale === 'ko' ? '작가님' : 'there'));
  const heading = tBilingual('Confirm your email', '이메일 인증', locale);
  const greeting = tBilingual(`Hi ${safeName},`, `${safeName}, 안녕하세요.`, locale);
  const body = tBilingual(
    'Click below to confirm your email and activate your Seizn account. Without confirmation, your API access stays disabled.',
    '아래 버튼을 눌러 이메일을 인증해주세요. 인증을 마쳐야 Seizn 계정이 활성화되고 API 사용이 시작됩니다.',
    locale
  );
  const cta = tBilingual('Confirm Email', '이메일 인증하기', locale);
  const expiry = tBilingual(
    'This link expires in 24 hours.',
    '이 링크는 24시간 내에 만료됩니다.',
    locale
  );
  const ignore = tBilingual(
    "If you didn't sign up for Seizn, you can safely ignore this email.",
    'Seizn에 가입한 적이 없다면 이 메일은 무시하셔도 됩니다.',
    locale
  );

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#1a1612;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4a4338;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 24px;font-size:16px;color:#4a4338;line-height:1.6;">${body}</p>
    <a href="${confirmLink}" style="display:inline-block;padding:12px 24px;background-color:#c96442;color:#fbf8f2;text-decoration:none;border-radius:9999px;font-weight:500;">
      ${cta}
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#6f6655;">${expiry}</p>
    <p style="margin:8px 0 0;font-size:14px;color:#6f6655;">${ignore}</p>
  `;
  return baseTemplate(content, heading);
}

// Payment receipt (Stripe webhook invoice.paid)
export function paymentReceiptEmail(
  params: {
    name: string;
    amount: string; // cents
    currency: string;
    invoiceNumber: string;
    invoiceUrl?: string;
    planLabel: string;
    periodStart: string; // ISO date
    periodEnd: string; // ISO date
  },
  locale: EmailLocale = 'en'
) {
  const safeName = escapeHtml(params.name || (locale === 'ko' ? '작가님' : 'there'));
  const amountDisplay = `${params.currency.toUpperCase()} ${(Number(params.amount) / 100).toFixed(2)}`;
  const heading = tBilingual('Payment Receipt', '결제 영수증', locale);
  const greeting = tBilingual(`Hi ${safeName},`, `${safeName}, 안녕하세요.`, locale);
  const body = tBilingual(
    'Thank you for your payment. Here are the details:',
    '결제가 완료되었습니다. 상세 내역은 아래와 같습니다.',
    locale
  );
  const labelInvoice = tBilingual('Invoice', '청구서', locale);
  const labelPlan = tBilingual('Plan', '플랜', locale);
  const labelPeriod = tBilingual('Period', '기간', locale);
  const labelAmount = tBilingual('Amount', '금액', locale);
  const cta = tBilingual('View Invoice', '청구서 보기', locale);

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#1a1612;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4a4338;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 24px;font-size:16px;color:#4a4338;line-height:1.6;">${body}</p>
    <div style="background:#f5f0e6;padding:20px;border-radius:8px;margin:0 0 24px;border:1px solid #ddd3bd;">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#1a1612;">
        <tr><td style="padding:6px 0;color:#6f6655;width:120px;">${labelInvoice}</td><td style="padding:6px 0;font-family:monospace;">${escapeHtml(params.invoiceNumber)}</td></tr>
        <tr><td style="padding:6px 0;color:#6f6655;">${labelPlan}</td><td style="padding:6px 0;">${escapeHtml(params.planLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#6f6655;">${labelPeriod}</td><td style="padding:6px 0;">${escapeHtml(params.periodStart)} — ${escapeHtml(params.periodEnd)}</td></tr>
        <tr><td style="padding:6px 0;color:#6f6655;">${labelAmount}</td><td style="padding:6px 0;font-weight:600;">${amountDisplay}</td></tr>
      </table>
    </div>
    ${params.invoiceUrl ? `
    <a href="${params.invoiceUrl}" style="display:inline-block;padding:12px 24px;background-color:#c96442;color:#fbf8f2;text-decoration:none;border-radius:9999px;font-weight:500;">
      ${cta}
    </a>` : ''}
  `;
  return baseTemplate(content, `${heading} — ${params.invoiceNumber}`);
}

// Founding member relaunch announcement + re-consent ask (W5.9).
// Sent at Wave 2 launch gate to existing dogfood users when ToS/Privacy version
// bumps from v1 → v2 (sub-processor + EU AI Act §50 + Cookie Consent additions).
export function foundingMemberRelaunchEmail(
  params: {
    name: string;
    legalDiffUrl: string;          // e.g. https://www.seizn.com/legal/privacy?diff=v2
    reconsentUrl: string;          // dashboard re-consent action URL
    charterEndDate: string;        // pre-formatted date string
  },
  locale: EmailLocale = 'en'
) {
  const safeName = escapeHtml(params.name || (locale === 'ko' ? '작가님' : 'there'));
  const heading = tBilingual('Welcome back — Seizn relaunches', '돌아오신 것을 환영합니다 — Seizn 재출시', locale);
  const greeting = tBilingual(`Hi ${safeName},`, `${safeName}, 안녕하세요.`, locale);
  const body1 = tBilingual(
    "We've shipped a major update: warm cream identity across landing + dashboard, full Track 1/2/3 pricing, EU AI Act Article 50 transparency, GDPR-aligned sub-processor disclosures, and self-hosted observability for stronger data residency.",
    '큰 업데이트를 출시했습니다: 랜딩 + 대시보드 통합 웜 크림 정체성, 전체 Track 1/2/3 가격, EU AI Act 제50조 공시, GDPR 정렬 수탁 처리자 명시, 데이터 거주지 강화를 위한 자체 호스팅 모니터링.',
    locale
  );
  const body2 = tBilingual(
    "Because this changes how we describe data handling, we're asking founding members to re-consent. It takes one click and you'll keep your Charter pricing locked through " + escapeHtml(params.charterEndDate) + '.',
    '데이터 처리 설명이 바뀌어 파운딩 멤버 분들의 재동의를 요청드립니다. 한 번의 클릭으로 끝나며, Charter 가격은 ' + escapeHtml(params.charterEndDate) + '까지 그대로 유지됩니다.',
    locale
  );
  const ctaPrimary = tBilingual('Review and re-consent', '변경 내용 확인 및 재동의', locale);
  const ctaSecondary = tBilingual('See what changed', '변경 내역 보기', locale);
  const footer = tBilingual(
    "If you don't re-consent within 30 days, your account stays active in read-only mode until you do. No data is deleted.",
    '30일 내에 재동의하지 않으면 계정은 읽기 전용 모드로 유지됩니다. 데이터는 삭제되지 않습니다.',
    locale
  );

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#1a1612;">${heading}</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#4a4338;line-height:1.6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:16px;color:#4a4338;line-height:1.6;">${body1}</p>
    <p style="margin:0 0 24px;font-size:16px;color:#4a4338;line-height:1.6;">${body2}</p>
    <a href="${params.reconsentUrl}" style="display:inline-block;padding:12px 24px;background-color:#c96442;color:#fbf8f2;text-decoration:none;border-radius:9999px;font-weight:500;margin-right:8px;">
      ${ctaPrimary}
    </a>
    <a href="${params.legalDiffUrl}" style="display:inline-block;padding:12px 20px;color:#4a4338;text-decoration:underline;font-size:14px;">
      ${ctaSecondary}
    </a>
    <p style="margin:24px 0 0;font-size:13px;color:#6f6655;">${footer}</p>
  `;
  return baseTemplate(content, heading);
}

// Track 3 desktop waitlist confirmation (W3.1)
export function waitlistConfirmEmail(
  email: string,
  confirmLink: string,
  locale: EmailLocale = 'en'
) {
  const safeEmail = escapeHtml(email);
  const heading = tBilingual(
    "You're on the list",
    '대기 명단에 등록되었습니다',
    locale
  );
  const body = tBilingual(
    `Thanks for joining the Seizn Desktop waitlist. To confirm <strong>${safeEmail}</strong>, click the button below.`,
    `Seizn Desktop 대기 명단에 등록해주셔서 감사합니다. <strong>${safeEmail}</strong> 인증을 위해 아래 버튼을 눌러주세요.`,
    locale
  );
  const cta = tBilingual('Confirm Email', '이메일 인증하기', locale);
  const expiry = tBilingual(
    'This link expires in 7 days. Once Desktop launches, you will be among the first to hear.',
    '이 링크는 7일 동안 유효합니다. Desktop이 출시되면 가장 먼저 알려드립니다.',
    locale
  );
  const ignore = tBilingual(
    "If you didn't sign up, you can ignore this email.",
    '대기 명단에 등록하신 적이 없다면 이 메일은 무시하셔도 됩니다.',
    locale
  );

  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#1a1612;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4a4338;line-height:1.6;">${body}</p>
    <a href="${confirmLink}" style="display:inline-block;padding:12px 24px;background-color:#c96442;color:#fbf8f2;text-decoration:none;border-radius:9999px;font-weight:500;">
      ${cta}
    </a>
    <p style="margin:24px 0 0;font-size:14px;color:#6f6655;">${expiry}</p>
    <p style="margin:8px 0 0;font-size:14px;color:#6f6655;">${ignore}</p>
  `;
  return baseTemplate(content, heading);
}
