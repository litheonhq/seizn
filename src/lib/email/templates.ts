// Base template wrapper
function baseTemplate(content: string, previewText?: string) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Seizn</title>
  ${previewText ? `<span style="display:none;font-size:1px;color:#fff;max-height:0;">${previewText}</span>` : ''}
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
                <a href="https://seizn.com/privacy" style="color:#6b7280;">Privacy</a> &middot;
                <a href="https://seizn.com/terms" style="color:#6b7280;">Terms</a> &middot;
                <a href="https://seizn.com" style="color:#6b7280;">seizn.com</a>
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
    <a href="https://seizn.com/dashboard" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
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
    <a href="https://seizn.com/dashboard" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
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
    <a href="https://seizn.com/dashboard/keys" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
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
    <a href="https://seizn.com/pricing" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
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
    <a href="https://seizn.com/dashboard" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View Dashboard
    </a>
  `;
  return baseTemplate(content, `Your weekly Seizn summary: ${memoriesCount} memories, ${apiCallsCount} API calls`);
}

// Enterprise inquiry confirmation
export function enterpriseInquiryConfirmationEmail(companyName: string, contactName: string) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">We Received Your Inquiry</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${contactName},
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Thank you for your interest in Seizn Enterprise for <strong>${companyName}</strong>.
      Our team will review your inquiry and get back to you within 1-2 business days.
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      In the meantime, feel free to explore our documentation or try our free tier.
    </p>
    <a href="https://seizn.com/docs" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View Documentation
    </a>
  `;
  return baseTemplate(content, `We received your enterprise inquiry for ${companyName}`);
}
