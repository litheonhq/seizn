import { Resend } from 'resend';
import { checkEmailRateLimit, type EmailTemplateKey } from './rate-limit';
import { createServerClient } from '@/lib/supabase';

// Lazy initialization to avoid build-time errors when API key is not set
let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const FROM_EMAIL = 'Seizn <noreply@seizn.com>';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  /** W2.5: required for rate-limit + suppression bookkeeping. */
  template?: EmailTemplateKey;
  /** Bypass rate limit + suppression (admin-only flows like password reset). */
  bypassGuards?: boolean;
}

interface SendEmailFailure {
  success: false;
  error: unknown;
  code?: 'rate_limited' | 'suppressed';
}

interface SendEmailSuccess {
  success: true;
  data: unknown;
}

type SendEmailResult = SendEmailSuccess | SendEmailFailure;

async function isSuppressed(recipient: string): Promise<boolean> {
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('email_suppression_list')
      .select('email, expires_at')
      .eq('email', recipient.trim().toLowerCase())
      .maybeSingle();
    if (!data) return false;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return false;
    }
    return true;
  } catch {
    // If suppression check fails, fail open — better to send than to silently
    // drop a transactional email (e.g., password reset).
    return false;
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const recipients = Array.isArray(options.to) ? options.to : [options.to];

  if (!options.bypassGuards) {
    for (const recipient of recipients) {
      // Suppression list check (hard bounce / complaint).
      if (await isSuppressed(recipient)) {
        return {
          success: false,
          code: 'suppressed',
          error: new Error(`Recipient ${recipient} is on suppression list`),
        };
      }

      // Rate limit (per-type + daily) — only enforced when template is supplied.
      if (options.template) {
        const rl = await checkEmailRateLimit(recipient, options.template);
        if (!rl.allowed) {
          return {
            success: false,
            code: 'rate_limited',
            error: new Error(
              `Email rate limit exceeded (${rl.reason}); retry in ${Math.ceil((rl.retryAfterMs ?? 0) / 1000)}s`
            ),
          };
        }
      }
    }
  }

  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo || 'support@seizn.com',
    });

    if (error) {
      console.error('Failed to send email:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Email service error:', error);
    return { success: false, error };
  }
}

// Batch send for multiple recipients
export async function sendBatchEmails(
  emails: Array<{
    to: string;
    subject: string;
    html: string;
  }>
) {
  try {
    const resend = getResend();
    const { data, error } = await resend.batch.send(
      emails.map((email) => ({
        from: FROM_EMAIL,
        ...email,
      }))
    );

    if (error) {
      console.error('Failed to send batch emails:', error);
      return { success: false, error };
    }

    return { success: true, data };
  } catch (error) {
    console.error('Batch email service error:', error);
    return { success: false, error };
  }
}

// Export getter function for advanced use cases
export { getResend };

// Re-export templates for convenience
export * from './templates';
export * from './rtbf-templates';
export type { EmailTemplateKey } from './rate-limit';
export { checkEmailRateLimit } from './rate-limit';
