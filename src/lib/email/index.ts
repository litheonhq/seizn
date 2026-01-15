import { Resend } from 'resend';

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
}

export async function sendEmail(options: SendEmailOptions) {
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
