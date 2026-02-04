/**
 * Auto-Eval Service
 *
 * Core service for running automatic evaluations when policies or models change.
 * Integrates with security tests, regression detection, and compliance checks.
 */

import { createClient } from '@/lib/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import type {
  EvalTriggerEvent,
  EvalRun,
  EvalRunRow,
  EvalTestResult,
  EvalRunSummary,
  AutoEvalConfig,
  AutoEvalConfigRow,
  EvalStatus,
} from './types';
import { markTriggerProcessed } from './events';

// ============================================
// Test Suite Runners (Imported dynamically)
// ============================================

interface SecurityTestRunner {
  runSingleTest: (testCase: unknown, evaluator: unknown) => Promise<unknown>;
  ALL_SECURITY_TESTS: unknown[];
}

interface RegressionChecker {
  detectRegression: (baselineRunId: string, candidateRunId: string) => Promise<unknown>;
}

// ============================================
// Auto-Eval Service
// ============================================

export class AutoEvalService {
  private supabase: Awaited<ReturnType<typeof createClient>> | null = null;

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  // ============================================
  // Configuration Management
  // ============================================

  async getConfig(organizationId: string, packId?: string): Promise<AutoEvalConfig | null> {
    const supabase = await this.getSupabase();

    let query = supabase
      .from('auto_eval_configs')
      .select('*')
      .eq('organization_id', organizationId);

    if (packId) {
      query = query.eq('pack_id', packId);
    } else {
      query = query.is('pack_id', null);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get eval config: ${error.message}`);
    }

    return this.rowToConfig(data);
  }

  async getOrCreateConfig(organizationId: string, packId?: string): Promise<AutoEvalConfig> {
    const existing = await this.getConfig(organizationId, packId);
    if (existing) return existing;

    const supabase = await this.getSupabase();

    const newConfig: Omit<AutoEvalConfigRow, 'created_at' | 'updated_at'> = {
      id: uuidv4(),
      organization_id: organizationId,
      pack_id: packId,
      eval_on_publish: true,
      eval_on_install: true,
      eval_on_update: true,
      eval_on_activation: true,
      run_security_tests: true,
      run_regression_tests: true,
      run_compliance_tests: false,
      run_performance_tests: false,
      block_on_critical: true,
      block_on_high: false,
      regression_threshold: 0.05,
      slack_webhook_url: undefined,
      email_recipients: [],
      notify_on_success: false,
      notify_on_failure: true,
    };

    const { data, error } = await supabase
      .from('auto_eval_configs')
      .insert(newConfig)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create eval config: ${error.message}`);
    }

    return this.rowToConfig(data);
  }

  async updateConfig(
    configId: string,
    updates: Partial<AutoEvalConfig>
  ): Promise<AutoEvalConfig> {
    const supabase = await this.getSupabase();

    const { data, error } = await supabase
      .from('auto_eval_configs')
      .update({
        eval_on_publish: updates.evalOnPublish,
        eval_on_install: updates.evalOnInstall,
        eval_on_update: updates.evalOnUpdate,
        eval_on_activation: updates.evalOnActivation,
        run_security_tests: updates.runSecurityTests,
        run_regression_tests: updates.runRegressionTests,
        run_compliance_tests: updates.runComplianceTests,
        run_performance_tests: updates.runPerformanceTests,
        block_on_critical: updates.blockOnCritical,
        block_on_high: updates.blockOnHigh,
        regression_threshold: updates.regressionThreshold,
        slack_webhook_url: updates.slackWebhookUrl,
        email_recipients: updates.emailRecipients,
        notify_on_success: updates.notifyOnSuccess,
        notify_on_failure: updates.notifyOnFailure,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update eval config: ${error.message}`);
    }

    return this.rowToConfig(data);
  }

  // ============================================
  // Evaluation Execution
  // ============================================

  async runEvaluation(trigger: EvalTriggerEvent): Promise<EvalRun> {
    const supabase = await this.getSupabase();
    const organizationId = trigger.metadata.organizationId as string | undefined;

    // Create eval run record
    const runId = uuidv4();
    const run: Omit<EvalRunRow, 'created_at'> = {
      id: runId,
      trigger_id: trigger.id,
      trigger_type: trigger.type,
      organization_id: organizationId,
      status: 'running',
      started_at: new Date().toISOString(),
      completed_at: undefined,
      summary: null,
      results: [],
      metadata: trigger.metadata,
    };

    await supabase.from('auto_eval_runs').insert(run);

    console.log(`[AutoEval] Starting evaluation run ${runId} for trigger ${trigger.id}`);

    try {
      // Get config for this organization
      const config = organizationId
        ? await this.getOrCreateConfig(organizationId, trigger.metadata.packId as string)
        : this.getDefaultConfig();

      const results: EvalTestResult[] = [];
      const startTime = Date.now();

      // Run security tests if enabled
      if (config.runSecurityTests) {
        const securityResults = await this.runSecurityTests(trigger);
        results.push(...securityResults);
      }

      // Run regression tests if enabled
      if (config.runRegressionTests && organizationId) {
        const regressionResults = await this.runRegressionTests(organizationId, trigger);
        results.push(...regressionResults);
      }

      // Run compliance tests if enabled
      if (config.runComplianceTests) {
        const complianceResults = await this.runComplianceTests(trigger);
        results.push(...complianceResults);
      }

      // Calculate summary
      const summary = this.calculateSummary(results, Date.now() - startTime);

      // Determine if we should block
      const shouldBlock = this.shouldBlockDeployment(summary, config);

      // Update run record
      const { data: updatedRun, error: updateError } = await supabase
        .from('auto_eval_runs')
        .update({
          status: 'completed' as EvalStatus,
          completed_at: new Date().toISOString(),
          summary,
          results,
          metadata: {
            ...trigger.metadata,
            blocked: shouldBlock,
          },
        })
        .eq('id', runId)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update eval run: ${updateError.message}`);
      }

      // Mark trigger as processed
      await markTriggerProcessed(trigger.id);

      // Send notifications
      await this.sendNotifications(this.rowToRun(updatedRun), config, shouldBlock);

      console.log(
        `[AutoEval] Completed evaluation run ${runId}: ${summary.passed}/${summary.totalTests} passed, blocked=${shouldBlock}`
      );

      return this.rowToRun(updatedRun);
    } catch (error) {
      // Mark run as failed
      await supabase
        .from('auto_eval_runs')
        .update({
          status: 'failed' as EvalStatus,
          completed_at: new Date().toISOString(),
          metadata: {
            ...trigger.metadata,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        })
        .eq('id', runId);

      throw error;
    }
  }

  // ============================================
  // Test Runners
  // ============================================

  private async runSecurityTests(trigger: EvalTriggerEvent): Promise<EvalTestResult[]> {
    const results: EvalTestResult[] = [];

    try {
      // Dynamic import to avoid circular dependencies
      const { runSecurityTestsForPolicy } = await import('./security-eval');
      const policyId = trigger.metadata.packId || trigger.metadata.policyId;

      if (policyId) {
        const securityResults = await runSecurityTestsForPolicy(policyId as string);
        results.push(...securityResults);
      } else {
        // Run all security tests
        const allResults = await runSecurityTestsForPolicy('__all__');
        results.push(...allResults);
      }
    } catch (error) {
      console.error('[AutoEval] Security tests failed:', error);
      results.push({
        testId: 'security-suite-error',
        testName: 'Security Test Suite',
        suite: 'security',
        status: 'error',
        severity: 'high',
        message: error instanceof Error ? error.message : 'Security tests failed',
        durationMs: 0,
      });
    }

    return results;
  }

  private async runRegressionTests(
    organizationId: string,
    trigger: EvalTriggerEvent
  ): Promise<EvalTestResult[]> {
    const results: EvalTestResult[] = [];

    try {
      const { runRegressionCheck } = await import('./regression-eval');
      const regressionResults = await runRegressionCheck(organizationId, trigger.metadata);
      results.push(...regressionResults);
    } catch (error) {
      console.error('[AutoEval] Regression tests failed:', error);
      results.push({
        testId: 'regression-suite-error',
        testName: 'Regression Test Suite',
        suite: 'regression',
        status: 'error',
        severity: 'medium',
        message: error instanceof Error ? error.message : 'Regression tests failed',
        durationMs: 0,
      });
    }

    return results;
  }

  private async runComplianceTests(trigger: EvalTriggerEvent): Promise<EvalTestResult[]> {
    const results: EvalTestResult[] = [];

    try {
      const { runComplianceCheck } = await import('./compliance-eval');
      const complianceResults = await runComplianceCheck(trigger.metadata);
      results.push(...complianceResults);
    } catch (error) {
      console.error('[AutoEval] Compliance tests failed:', error);
      results.push({
        testId: 'compliance-suite-error',
        testName: 'Compliance Test Suite',
        suite: 'compliance',
        status: 'error',
        severity: 'medium',
        message: error instanceof Error ? error.message : 'Compliance tests failed',
        durationMs: 0,
      });
    }

    return results;
  }

  // ============================================
  // Helpers
  // ============================================

  private calculateSummary(results: EvalTestResult[], durationMs: number): EvalRunSummary {
    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const criticalIssues = results.filter(
      (r) => r.status === 'failed' && r.severity === 'critical'
    ).length;
    const highIssues = results.filter(
      (r) => r.status === 'failed' && r.severity === 'high'
    ).length;

    return {
      totalTests: results.length,
      passed,
      failed,
      skipped,
      errors,
      criticalIssues,
      highIssues,
      durationMs,
    };
  }

  private shouldBlockDeployment(summary: EvalRunSummary, config: AutoEvalConfig): boolean {
    if (config.blockOnCritical && summary.criticalIssues > 0) {
      return true;
    }
    if (config.blockOnHigh && summary.highIssues > 0) {
      return true;
    }
    return false;
  }

  private async sendNotifications(
    run: EvalRun,
    config: AutoEvalConfig,
    blocked: boolean
  ): Promise<void> {
    const shouldNotify =
      (config.notifyOnFailure && (run.summary?.failed ?? 0) > 0) ||
      (config.notifyOnSuccess && (run.summary?.failed ?? 0) === 0) ||
      blocked;

    if (!shouldNotify) return;

    // Slack notification
    if (config.slackWebhookUrl) {
      await this.sendSlackNotification(run, config.slackWebhookUrl, blocked);
    }

    // Email notifications would go here
    // For now, we just log
    if (config.emailRecipients.length > 0) {
      console.log(
        `[AutoEval] Would send email to ${config.emailRecipients.join(', ')} for run ${run.id}`
      );
    }
  }

  private async sendSlackNotification(
    run: EvalRun,
    webhookUrl: string,
    blocked: boolean
  ): Promise<void> {
    const summary = run.summary;
    if (!summary) return;

    const status = blocked
      ? ':x: BLOCKED'
      : summary.failed > 0
        ? ':warning: Issues Found'
        : ':white_check_mark: Passed';

    const message = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `Auto-Eval: ${status}`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Trigger:* ${run.triggerType}`,
            },
            {
              type: 'mrkdwn',
              text: `*Duration:* ${summary.durationMs}ms`,
            },
            {
              type: 'mrkdwn',
              text: `*Passed:* ${summary.passed}/${summary.totalTests}`,
            },
            {
              type: 'mrkdwn',
              text: `*Failed:* ${summary.failed} (${summary.criticalIssues} critical)`,
            },
          ],
        },
      ],
    };

    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch (error) {
      console.error('[AutoEval] Failed to send Slack notification:', error);
    }
  }

  private getDefaultConfig(): AutoEvalConfig {
    return {
      id: 'default',
      organizationId: '',
      evalOnPublish: true,
      evalOnInstall: true,
      evalOnUpdate: true,
      evalOnActivation: true,
      runSecurityTests: true,
      runRegressionTests: false,
      runComplianceTests: false,
      runPerformanceTests: false,
      blockOnCritical: true,
      blockOnHigh: false,
      regressionThreshold: 0.05,
      emailRecipients: [],
      notifyOnSuccess: false,
      notifyOnFailure: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  private rowToConfig(row: AutoEvalConfigRow): AutoEvalConfig {
    return {
      id: row.id,
      organizationId: row.organization_id,
      packId: row.pack_id,
      evalOnPublish: row.eval_on_publish,
      evalOnInstall: row.eval_on_install,
      evalOnUpdate: row.eval_on_update,
      evalOnActivation: row.eval_on_activation,
      runSecurityTests: row.run_security_tests,
      runRegressionTests: row.run_regression_tests,
      runComplianceTests: row.run_compliance_tests,
      runPerformanceTests: row.run_performance_tests,
      blockOnCritical: row.block_on_critical,
      blockOnHigh: row.block_on_high,
      regressionThreshold: row.regression_threshold,
      slackWebhookUrl: row.slack_webhook_url,
      emailRecipients: row.email_recipients,
      notifyOnSuccess: row.notify_on_success,
      notifyOnFailure: row.notify_on_failure,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private rowToRun(row: EvalRunRow): EvalRun {
    return {
      id: row.id,
      triggerId: row.trigger_id,
      triggerType: row.trigger_type,
      organizationId: row.organization_id,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      summary: row.summary ?? undefined,
      results: row.results,
      metadata: row.metadata,
    };
  }

  // ============================================
  // History & Retrieval
  // ============================================

  async getRunById(runId: string): Promise<EvalRun | null> {
    const supabase = await this.getSupabase();

    const { data, error } = await supabase
      .from('auto_eval_runs')
      .select('*')
      .eq('id', runId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get eval run: ${error.message}`);
    }

    return this.rowToRun(data);
  }

  async getRunHistory(
    organizationId: string,
    options: { page?: number; pageSize?: number; triggerType?: string } = {}
  ): Promise<{ runs: EvalRun[]; total: number }> {
    const supabase = await this.getSupabase();
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    let query = supabase
      .from('auto_eval_runs')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('started_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (options.triggerType) {
      query = query.eq('trigger_type', options.triggerType);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to get eval history: ${error.message}`);
    }

    return {
      runs: (data || []).map(this.rowToRun),
      total: count ?? 0,
    };
  }
}

// Export singleton instance
export const autoEvalService = new AutoEvalService();
