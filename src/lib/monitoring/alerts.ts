/**
 * Alert Manager for SLO Monitoring
 * Handles alert deduplication, cooldowns, and Telegram notifications
 */

import type { AlertEvent } from './types';
import { ALERT_CONFIG, TELEGRAM_CONFIG } from './config';

interface AlertState {
  lastAlertTime: number;
  lastAlertType: string;
}

/**
 * Alert Manager class
 */
class AlertManager {
  private alertHistory: Map<string, AlertState> = new Map();

  /**
   * Check if alert should be sent (cooldown check)
   */
  private shouldSendAlert(metric: string): boolean {
    const state = this.alertHistory.get(metric);

    if (!state) {
      return true;
    }

    const now = Date.now();
    return now - state.lastAlertTime >= ALERT_CONFIG.cooldownMs;
  }

  /**
   * Update alert state after sending
   */
  private updateAlertState(metric: string, alertType: string): void {
    this.alertHistory.set(metric, {
      lastAlertTime: Date.now(),
      lastAlertType: alertType,
    });
  }

  /**
   * Format alert message for Telegram
   */
  private formatTelegramMessage(alert: AlertEvent): string {
    const severityEmoji = alert.severity === 'critical' ? '🚨' : '⚠️';
    const statusEmoji = alert.type === 'slo_breach' ? '❌' : '⚡';

    const lines = [
      `${severityEmoji} *SLO Alert: ${alert.metric}*`,
      '',
      `${statusEmoji} ${alert.message}`,
      '',
      '📊 *Details:*',
      `• Current: \`${alert.value}\``,
      `• Threshold: \`${alert.threshold}\``,
      `• Severity: \`${alert.severity.toUpperCase()}\``,
      '',
      `🕐 ${alert.timestamp}`,
      '',
      '_Seizn SLO Monitoring_',
    ];

    return lines.join('\n');
  }

  /**
   * Send alert to Telegram
   */
  private async sendTelegramAlert(message: string): Promise<boolean> {
    const { botToken, chatId } = TELEGRAM_CONFIG;

    if (!botToken || !chatId) {
      console.warn('[SLO Alert] Telegram credentials not configured');
      return false;
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[SLO Alert] Telegram API error:', errorText);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[SLO Alert] Failed to send Telegram alert:', error);
      return false;
    }
  }

  /**
   * Send an alert (with cooldown and deduplication)
   */
  async sendAlert(alert: AlertEvent): Promise<boolean> {
    if (!ALERT_CONFIG.enabled) {
      return false;
    }

    // Check cooldown
    if (!this.shouldSendAlert(alert.metric)) {
      console.log(`[SLO Alert] Skipping alert for ${alert.metric} (cooldown active)`);
      return false;
    }

    // Format and send
    const message = this.formatTelegramMessage(alert);
    const success = await this.sendTelegramAlert(message);

    if (success) {
      this.updateAlertState(alert.metric, alert.type);
      console.log(`[SLO Alert] Alert sent for ${alert.metric}`);
    }

    return success;
  }

  /**
   * Send a custom alert message
   */
  async sendCustomAlert(
    title: string,
    message: string,
    severity: 'warning' | 'critical' = 'warning'
  ): Promise<boolean> {
    const severityEmoji = severity === 'critical' ? '🚨' : '⚠️';

    const formattedMessage = [
      `${severityEmoji} *${title}*`,
      '',
      message,
      '',
      `🕐 ${new Date().toISOString()}`,
      '',
      '_Seizn SLO Monitoring_',
    ].join('\n');

    return this.sendTelegramAlert(formattedMessage);
  }

  /**
   * Send recovery notification
   */
  async sendRecoveryAlert(metric: string): Promise<boolean> {
    const message = [
      `✅ *SLO Recovery: ${metric}*`,
      '',
      `The ${metric} SLO has returned to healthy status.`,
      '',
      `🕐 ${new Date().toISOString()}`,
      '',
      '_Seizn SLO Monitoring_',
    ].join('\n');

    return this.sendTelegramAlert(message);
  }

  /**
   * Get alert history for a metric
   */
  getAlertHistory(metric: string): AlertState | undefined {
    return this.alertHistory.get(metric);
  }

  /**
   * Clear alert history (for testing)
   */
  clearHistory(): void {
    this.alertHistory.clear();
  }

  /**
   * Check if Telegram is configured
   */
  isConfigured(): boolean {
    return !!(TELEGRAM_CONFIG.botToken && TELEGRAM_CONFIG.chatId);
  }
}

// Singleton instance
export const alertManager = new AlertManager();

/**
 * Convenience function to send SLO breach alert
 */
export async function sendSLOBreachAlert(
  metric: string,
  currentValue: number,
  targetValue: number,
  unit: string
): Promise<boolean> {
  return alertManager.sendAlert({
    id: `breach-${metric}-${Date.now()}`,
    type: 'slo_breach',
    metric,
    message: `${metric} is ${currentValue}${unit} (target: ${targetValue}${unit})`,
    severity: 'critical',
    timestamp: new Date().toISOString(),
    value: currentValue,
    threshold: targetValue,
  });
}
