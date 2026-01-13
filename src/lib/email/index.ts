import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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

export { resend };

// Re-export templates for convenience
export * from './templates';
export * from './rtbf-templates';
