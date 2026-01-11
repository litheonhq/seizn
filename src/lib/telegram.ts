/**
 * Telegram Alert Utility for Security Notifications
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

interface AlertParams {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  details?: Record<string, unknown>;
}

/**
 * Send alert to Telegram
 */
export async function sendTelegramAlert(params: AlertParams): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !ADMIN_CHAT_ID) {
    console.warn('Telegram credentials not configured');
    return false;
  }

  const severityEmoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
  };

  const text = [
    `${severityEmoji[params.severity]} *${params.title}*`,
    '',
    params.message,
    '',
    params.details ? `\`\`\`json\n${JSON.stringify(params.details, null, 2)}\n\`\`\`` : '',
    '',
    `🕐 ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_CHAT_ID,
          text,
          parse_mode: 'Markdown',
        }),
      }
    );

    if (!response.ok) {
      console.error('Telegram API error:', await response.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to send Telegram alert:', error);
    return false;
  }
}

/**
 * Alert: Authentication failure (multiple attempts)
 */
export async function alertAuthFailure(
  ip: string,
  reason: string,
  attempts?: number
): Promise<void> {
  await sendTelegramAlert({
    title: 'Authentication Failure',
    message: `Failed login attempt detected`,
    severity: attempts && attempts > 5 ? 'critical' : 'warning',
    details: {
      ip,
      reason,
      attempts,
    },
  });
}

/**
 * Alert: Suspicious activity
 */
export async function alertSuspiciousActivity(
  userId: string,
  activityType: string,
  details: Record<string, unknown>
): Promise<void> {
  await sendTelegramAlert({
    title: 'Suspicious Activity Detected',
    message: `Unusual behavior from user: ${userId}`,
    severity: 'warning',
    details: {
      userId,
      activityType,
      ...details,
    },
  });
}

/**
 * Alert: Rate limit exceeded (potential attack)
 */
export async function alertRateLimitExceeded(
  userId: string,
  ip: string,
  limit: number
): Promise<void> {
  await sendTelegramAlert({
    title: 'Rate Limit Exceeded',
    message: `User hit rate limit - possible abuse`,
    severity: 'warning',
    details: {
      userId,
      ip,
      limit,
    },
  });
}

/**
 * Alert: API key expired (for user notification)
 */
export async function alertApiKeyExpired(
  userId: string,
  keyPrefix: string
): Promise<void> {
  await sendTelegramAlert({
    title: 'API Key Expired',
    message: `An API key has expired`,
    severity: 'info',
    details: {
      userId,
      keyPrefix,
    },
  });
}

/**
 * Alert: Critical security event
 */
export async function alertCriticalSecurity(
  title: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  await sendTelegramAlert({
    title,
    message,
    severity: 'critical',
    details,
  });
}
