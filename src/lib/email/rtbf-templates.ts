/**
 * RTBF (Right to Be Forgotten) Email Templates
 * GDPR Article 17 compliant email notifications
 */

// Base template wrapper (duplicated to keep this file self-contained)
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

// Scope labels for human-readable display
const scopeLabels: Record<string, string> = {
  user: 'All user data',
  memory: 'Selected memories',
  namespace: 'Specific namespace',
  date_range: 'Date range',
};

// ============================================
// RTBF Deletion Confirmation Email
// ============================================

export interface RTBFDeletionConfirmationParams {
  name: string;
  requestId: string;
  scope: string;
  deletedCount: number;
  certificateId?: string;
  verificationHash?: string;
  completedAt: string;
}

export function rtbfDeletionConfirmationEmail(params: RTBFDeletionConfirmationParams) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Your Data Has Been Deleted</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${params.name || 'there'},
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Your data deletion request has been completed in accordance with GDPR Article 17 (Right to Erasure).
    </p>
    <div style="background:#f3f4f6;padding:20px;border-radius:8px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Request ID</p>
            <p style="margin:4px 0 0;font-size:14px;font-family:monospace;color:#111827;">${params.requestId}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Scope</p>
            <p style="margin:4px 0 0;font-size:16px;color:#111827;">${scopeLabels[params.scope] || params.scope}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Records Deleted</p>
            <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#111827;">${params.deletedCount.toLocaleString()}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Completed At</p>
            <p style="margin:4px 0 0;font-size:16px;color:#111827;">${new Date(params.completedAt).toLocaleString()}</p>
          </td>
        </tr>
        ${params.certificateId ? `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Certificate ID</p>
            <p style="margin:4px 0 0;font-size:14px;font-family:monospace;color:#111827;">${params.certificateId}</p>
          </td>
        </tr>
        ` : ''}
        ${params.verificationHash ? `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Verification Hash</p>
            <p style="margin:4px 0 0;font-size:12px;font-family:monospace;color:#111827;word-break:break-all;">${params.verificationHash}</p>
          </td>
        </tr>
        ` : ''}
      </table>
    </div>
    <div style="background:#d1fae5;padding:16px;border-radius:8px;margin:0 0 24px;border:1px solid #10b981;">
      <p style="margin:0;font-size:14px;color:#065f46;">
        <strong>Verification Complete:</strong> All specified data has been permanently removed from our systems.
        This deletion is irreversible and complies with GDPR requirements.
      </p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      If you have any questions about this deletion or need additional documentation for compliance purposes,
      please contact our support team.
    </p>
    <a href="https://seizn.com/support" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      Contact Support
    </a>
  `;
  return baseTemplate(content, 'Your data has been deleted - GDPR Compliance');
}

// ============================================
// RTBF Request Received Email
// ============================================

export interface RTBFRequestReceivedParams {
  name: string;
  requestId: string;
  scope: string;
  estimatedCompletionTime?: string;
}

export function rtbfRequestReceivedEmail(params: RTBFRequestReceivedParams) {
  const content = `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:600;color:#111827;">Data Deletion Request Received</h1>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      Hi ${params.name || 'there'},
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
      We have received your request to delete your data under GDPR Article 17 (Right to Erasure).
    </p>
    <div style="background:#f3f4f6;padding:20px;border-radius:8px;margin:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Request ID</p>
            <p style="margin:4px 0 0;font-size:14px;font-family:monospace;color:#111827;">${params.requestId}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Scope</p>
            <p style="margin:4px 0 0;font-size:16px;color:#111827;">${scopeLabels[params.scope] || params.scope}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Status</p>
            <p style="margin:4px 0 0;font-size:16px;color:#f59e0b;font-weight:500;">Processing</p>
          </td>
        </tr>
        ${params.estimatedCompletionTime ? `
        <tr>
          <td style="padding:8px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:14px;color:#6b7280;">Estimated Completion</p>
            <p style="margin:4px 0 0;font-size:16px;color:#111827;">${params.estimatedCompletionTime}</p>
          </td>
        </tr>
        ` : ''}
      </table>
    </div>
    <div style="background:#fef3c7;padding:16px;border-radius:8px;margin:0 0 24px;border:1px solid #fcd34d;">
      <p style="margin:0;font-size:14px;color:#92400e;">
        <strong>Important:</strong> Under GDPR, we are required to process your request within 30 days.
        You will receive a confirmation email once the deletion is complete.
      </p>
    </div>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;">
      You can check the status of your request at any time in your dashboard.
    </p>
    <a href="https://seizn.com/dashboard/privacy" style="display:inline-block;padding:12px 24px;background-color:#000;color:#fff;text-decoration:none;border-radius:9999px;font-weight:500;">
      View Request Status
    </a>
  `;
  return baseTemplate(content, 'Data deletion request received - GDPR');
}
