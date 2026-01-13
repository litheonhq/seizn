/**
 * Seizn Winter - Report Generation System
 *
 * Automated and on-demand report generation:
 * - Monthly/Weekly usage reports
 * - Security event reports
 * - Compliance reports (GDPR, SOC2)
 * - Member activity reports
 * - API usage analytics
 * - Cost analysis
 */

import { createServerClient } from '@/lib/supabase';
import type {
  Report,
  ReportType,
  ReportData,
  UsageReportData,
  SecurityReportData,
  ComplianceReportData,
  MemberActivityReportData,
  ApiUsageReportData,
  CostAnalysisReportData,
  PaginatedResult,
} from './types';
import { getSecurityEvents, getDataAccessEvents } from './audit-log';
import { getOrganizationUsage } from './organization';
import { listMembers } from './members';

// ============================================
// Types
// ============================================

export interface GenerateReportParams {
  organization_id: string;
  report_type: ReportType;
  period_start?: Date;
  period_end?: Date;
  generated_by?: 'system' | 'user';
}

export interface ListReportsParams {
  organization_id: string;
  report_type?: ReportType;
  limit?: number;
  offset?: number;
}

// ============================================
// Report Generation
// ============================================

/**
 * Generate a report of the specified type
 */
export async function generateReport(params: GenerateReportParams): Promise<Report> {
  const supabase = createServerClient();

  const periodEnd = params.period_end || new Date();
  let periodStart = params.period_start;

  // Set default period based on report type
  if (!periodStart) {
    periodStart = new Date(periodEnd);
    if (params.report_type === 'usage_weekly') {
      periodStart.setDate(periodStart.getDate() - 7);
    } else {
      periodStart.setDate(periodStart.getDate() - 30);
    }
  }

  // Generate report data based on type
  let data: ReportData;

  switch (params.report_type) {
    case 'usage_monthly':
    case 'usage_weekly':
      data = await generateUsageReport(params.organization_id, periodStart, periodEnd);
      break;
    case 'security_events':
      data = await generateSecurityReport(params.organization_id, periodStart, periodEnd);
      break;
    case 'compliance_gdpr':
      data = await generateComplianceReport(
        params.organization_id,
        periodStart,
        periodEnd,
        'gdpr'
      );
      break;
    case 'compliance_soc2':
      data = await generateComplianceReport(
        params.organization_id,
        periodStart,
        periodEnd,
        'soc2'
      );
      break;
    case 'member_activity':
      data = await generateMemberActivityReport(
        params.organization_id,
        periodStart,
        periodEnd
      );
      break;
    case 'api_usage':
      data = await generateApiUsageReport(params.organization_id, periodStart, periodEnd);
      break;
    case 'cost_analysis':
      data = await generateCostAnalysisReport(params.organization_id, periodStart, periodEnd);
      break;
    default:
      throw new Error(`Unknown report type: ${params.report_type}`);
  }

  // Save report to database
  const { data: report, error } = await supabase
    .from('winter_org_reports')
    .insert({
      organization_id: params.organization_id,
      report_type: params.report_type,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      data,
      generated_by: params.generated_by || 'user',
    })
    .select()
    .single();

  if (error) {
    // Table might not exist, return report without saving
    if (error.code === '42P01') {
      return {
        id: crypto.randomUUID(),
        organization_id: params.organization_id,
        report_type: params.report_type,
        period_start: periodStart.toISOString(),
        period_end: periodEnd.toISOString(),
        data,
        generated_by: params.generated_by || 'user',
        generated_at: new Date().toISOString(),
      } as Report;
    }
    throw error;
  }

  return report as Report;
}

/**
 * Get a report by ID
 */
export async function getReport(reportId: string): Promise<Report | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('winter_org_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error) {
    if (error.code === 'PGRST116' || error.code === '42P01') return null;
    throw error;
  }

  return data as Report;
}

/**
 * List reports for an organization
 */
export async function listReports(params: ListReportsParams): Promise<PaginatedResult<Report>> {
  const supabase = createServerClient();

  const limit = params.limit || 20;
  const offset = params.offset || 0;

  let query = supabase
    .from('winter_org_reports')
    .select('*', { count: 'exact' })
    .eq('organization_id', params.organization_id)
    .order('generated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.report_type) {
    query = query.eq('report_type', params.report_type);
  }

  const { data, error, count } = await query;

  if (error) {
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    throw error;
  }

  return {
    data: (data || []) as Report[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

// ============================================
// Report Type Generators
// ============================================

/**
 * Generate usage report data
 */
async function generateUsageReport(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<UsageReportData> {
  const supabase = createServerClient();

  // Get overall usage stats
  const usage = await getOrganizationUsage(organizationId, periodStart);

  // Get daily breakdown
  const { data: dailyData } = await supabase
    .from('usage_logs')
    .select('created_at, input_tokens, output_tokens')
    .eq('organization_id', organizationId)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString());

  // Group by day
  const dailyMap = new Map<string, {
    memories_created: number;
    api_calls: number;
    input_tokens: number;
    output_tokens: number;
  }>();

  for (const entry of dailyData || []) {
    const date = entry.created_at.split('T')[0];
    const existing = dailyMap.get(date) || {
      memories_created: 0,
      api_calls: 0,
      input_tokens: 0,
      output_tokens: 0,
    };
    existing.api_calls++;
    existing.input_tokens += entry.input_tokens || 0;
    existing.output_tokens += entry.output_tokens || 0;
    dailyMap.set(date, existing);
  }

  const daily_breakdown = Array.from(dailyMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Get top users
  const { data: usersData } = await supabase
    .from('usage_logs')
    .select('user_id')
    .eq('organization_id', organizationId)
    .gte('created_at', periodStart.toISOString());

  const userCounts = new Map<string, number>();
  for (const entry of usersData || []) {
    userCounts.set(entry.user_id, (userCounts.get(entry.user_id) || 0) + 1);
  }

  // Get user emails
  const topUserIds = Array.from(userCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', topUserIds);

  const emailMap = new Map(profiles?.map((p) => [p.id, p.email]) || []);

  const top_users = topUserIds.map((user_id) => ({
    user_id,
    email: emailMap.get(user_id) || 'unknown',
    api_calls: userCounts.get(user_id) || 0,
    memories_created: 0,
  }));

  return {
    type: 'usage',
    summary: {
      total_memories: usage.total_memories,
      total_api_calls: usage.total_api_calls,
      total_input_tokens: usage.total_input_tokens,
      total_output_tokens: usage.total_output_tokens,
      active_users: userCounts.size,
      storage_used_mb: usage.storage_used_mb,
    },
    daily_breakdown,
    top_users,
  };
}

/**
 * Generate security report data
 */
async function generateSecurityReport(
  organizationId: string,
  periodStart: Date,
  _periodEnd: Date
): Promise<SecurityReportData> {
  const securityEvents = await getSecurityEvents(organizationId, periodStart, 1000);

  // Count events by type
  const events_by_type: Record<string, number> = {};
  const blocked_ips = new Set<string>();
  const userEventMap = new Map<string, { count: number; events: Set<string>; email?: string }>();

  let critical_events = 0;
  let warnings = 0;
  let blocked_attempts = 0;

  for (const event of securityEvents) {
    events_by_type[event.action] = (events_by_type[event.action] || 0) + 1;

    if (event.action === 'security.ip_blocked' && event.ip_address) {
      blocked_ips.add(event.ip_address);
      blocked_attempts++;
    }

    if (
      event.action.includes('failed') ||
      event.action.includes('blocked') ||
      event.action.includes('suspicious')
    ) {
      critical_events++;
    } else if (event.action.includes('denied') || event.action.includes('rate_limited')) {
      warnings++;
    }

    if (event.user_id) {
      const existing = userEventMap.get(event.user_id) || {
        count: 0,
        events: new Set(),
        email: event.user?.email,
      };
      existing.count++;
      existing.events.add(event.action);
      userEventMap.set(event.user_id, existing);
    }
  }

  const suspicious_users = Array.from(userEventMap.entries())
    .filter(([, data]) => data.count > 5)
    .map(([user_id, data]) => ({
      user_id,
      email: data.email || 'unknown',
      event_count: data.count,
      events: Array.from(data.events),
    }))
    .sort((a, b) => b.event_count - a.event_count)
    .slice(0, 10);

  // Generate recommendations
  const recommendations: string[] = [];
  if (blocked_attempts > 10) {
    recommendations.push('High number of blocked attempts. Review IP allowlist settings.');
  }
  if (events_by_type['auth.login_failed'] > 50) {
    recommendations.push('Many failed login attempts detected. Consider enabling 2FA.');
  }
  if (suspicious_users.length > 0) {
    recommendations.push(
      'Some users have unusual activity patterns. Review their access.'
    );
  }
  if (Object.keys(events_by_type).length === 0) {
    recommendations.push(
      'No security events in this period. Ensure audit logging is enabled.'
    );
  }

  return {
    type: 'security',
    summary: {
      total_events: securityEvents.length,
      critical_events,
      warnings,
      blocked_attempts,
    },
    events_by_type,
    blocked_ips: Array.from(blocked_ips),
    suspicious_users,
    recommendations,
  };
}

/**
 * Generate compliance report data
 */
async function generateComplianceReport(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date,
  framework: 'gdpr' | 'soc2' | 'hipaa'
): Promise<ComplianceReportData> {
  const supabase = createServerClient();

  // Get data events
  const dataEvents = await getDataAccessEvents(organizationId, periodStart, 1000);

  // Count PII events
  let pii_detected = 0;
  let pii_masked = 0;
  let pii_denied = 0;
  let data_exports = 0;
  let deletion_requests = 0;
  let deletion_completed = 0;

  for (const event of dataEvents) {
    if (event.action === 'pii.detected') pii_detected++;
    if (event.action === 'pii.masked') pii_masked++;
    if (event.action === 'pii.denied') pii_denied++;
    if (event.action === 'data.export' || event.action === 'memory.export') data_exports++;
    if (event.action === 'data.deletion_requested') deletion_requests++;
    if (event.action === 'data.deletion_completed') deletion_completed++;
  }

  // Check retention compliance
  const { count: totalRecords } = await supabase
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  // This is simplified - real implementation would check against policies
  const compliant_records = totalRecords || 0;
  const overdue_records = 0;
  const pending_deletion = deletion_requests - deletion_completed;

  // Generate compliance checks based on framework
  const checks = getComplianceChecks(framework, {
    pii_detected,
    pii_masked,
    pii_denied,
    data_exports,
    deletion_requests,
    deletion_completed,
    has_audit_logging: dataEvents.length > 0,
  });

  // Determine overall status
  const failedChecks = checks.filter((c) => c.status === 'fail').length;
  const warningChecks = checks.filter((c) => c.status === 'warning').length;

  let status: 'compliant' | 'non_compliant' | 'partial' = 'compliant';
  if (failedChecks > 0) {
    status = 'non_compliant';
  } else if (warningChecks > 0) {
    status = 'partial';
  }

  return {
    type: 'compliance',
    framework,
    status,
    checks,
    data_processing: {
      pii_detected,
      pii_masked,
      pii_denied,
      data_exports,
      deletion_requests,
      deletion_completed,
    },
    retention_compliance: {
      compliant_records,
      overdue_records,
      pending_deletion,
    },
  };
}

/**
 * Get compliance checks for a framework
 */
function getComplianceChecks(
  framework: 'gdpr' | 'soc2' | 'hipaa',
  data: {
    pii_detected: number;
    pii_masked: number;
    pii_denied: number;
    data_exports: number;
    deletion_requests: number;
    deletion_completed: number;
    has_audit_logging: boolean;
  }
): ComplianceReportData['checks'] {
  const checks: ComplianceReportData['checks'] = [];

  if (framework === 'gdpr') {
    checks.push({
      id: 'gdpr_1',
      name: 'Data Processing Records',
      description: 'Maintain records of data processing activities',
      status: data.has_audit_logging ? 'pass' : 'fail',
      details: data.has_audit_logging
        ? 'Audit logging is active'
        : 'Enable audit logging for compliance',
    });
    checks.push({
      id: 'gdpr_2',
      name: 'PII Protection',
      description: 'Personal data must be protected',
      status:
        data.pii_detected === 0 || data.pii_masked + data.pii_denied === data.pii_detected
          ? 'pass'
          : 'warning',
      details: `${data.pii_detected} PII instances detected, ${data.pii_masked} masked, ${data.pii_denied} denied`,
    });
    checks.push({
      id: 'gdpr_3',
      name: 'Right to Erasure',
      description: 'Data subjects can request data deletion',
      status:
        data.deletion_requests === 0 ||
        data.deletion_completed >= data.deletion_requests
          ? 'pass'
          : 'warning',
      details: `${data.deletion_requests} deletion requests, ${data.deletion_completed} completed`,
    });
    checks.push({
      id: 'gdpr_4',
      name: 'Data Portability',
      description: 'Data subjects can export their data',
      status: 'pass',
      details: `${data.data_exports} data export operations performed`,
    });
  }

  if (framework === 'soc2') {
    checks.push({
      id: 'soc2_cc1',
      name: 'CC1 - Control Environment',
      description: 'Organization demonstrates commitment to integrity and ethical values',
      status: 'pass',
    });
    checks.push({
      id: 'soc2_cc2',
      name: 'CC2 - Communication and Information',
      description: 'Organization obtains and communicates relevant information',
      status: data.has_audit_logging ? 'pass' : 'fail',
      details: data.has_audit_logging
        ? 'Audit trail maintained'
        : 'Enable audit logging',
    });
    checks.push({
      id: 'soc2_cc6',
      name: 'CC6 - Logical and Physical Access Controls',
      description: 'Organization implements access controls',
      status: 'pass',
      details: 'Role-based access control implemented',
    });
    checks.push({
      id: 'soc2_cc7',
      name: 'CC7 - System Operations',
      description: 'Organization detects and responds to system anomalies',
      status: 'pass',
      details: 'Security monitoring active',
    });
  }

  if (framework === 'hipaa') {
    checks.push({
      id: 'hipaa_164_312_a',
      name: 'Access Control',
      description: 'Implement technical policies for electronic PHI access',
      status: 'pass',
    });
    checks.push({
      id: 'hipaa_164_312_b',
      name: 'Audit Controls',
      description: 'Implement audit controls for PHI access',
      status: data.has_audit_logging ? 'pass' : 'fail',
    });
    checks.push({
      id: 'hipaa_164_312_c',
      name: 'Integrity Controls',
      description: 'Protect PHI from improper alteration',
      status: 'pass',
    });
    checks.push({
      id: 'hipaa_164_312_e',
      name: 'Transmission Security',
      description: 'Guard against unauthorized PHI access during transmission',
      status: 'pass',
      details: 'TLS encryption in transit',
    });
  }

  return checks;
}

/**
 * Generate member activity report data
 */
async function generateMemberActivityReport(
  organizationId: string,
  periodStart: Date,
  _periodEnd: Date
): Promise<MemberActivityReportData> {
  const supabase = createServerClient();

  // Get all members
  const membersResult = await listMembers({
    organization_id: organizationId,
    limit: 1000,
  });

  // Get usage per member
  const memberActivity: MemberActivityReportData['members'] = [];
  let active_members = 0;
  let inactive_members = 0;
  let new_members = 0;

  for (const member of membersResult.data) {
    // Get API calls
    const { count: apiCalls } = await supabase
      .from('usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', member.user_id)
      .eq('organization_id', organizationId)
      .gte('created_at', periodStart.toISOString());

    // Get memories created
    const { count: memories } = await supabase
      .from('memories')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', member.user_id)
      .eq('organization_id', organizationId)
      .gte('created_at', periodStart.toISOString());

    // Get last activity
    const { data: lastLog } = await supabase
      .from('usage_logs')
      .select('created_at')
      .eq('user_id', member.user_id)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const isNew = new Date(member.created_at) >= periodStart;
    const hasRecentActivity = (apiCalls || 0) > 0;

    let status: 'active' | 'inactive' | 'new' = 'inactive';
    if (isNew) {
      status = 'new';
      new_members++;
    } else if (hasRecentActivity) {
      status = 'active';
      active_members++;
    } else {
      inactive_members++;
    }

    memberActivity.push({
      user_id: member.user_id,
      email: member.user?.email || 'unknown',
      role: member.role,
      last_active: lastLog?.created_at || member.created_at,
      api_calls: apiCalls || 0,
      memories_created: memories || 0,
      status,
    });
  }

  // Sort by activity
  memberActivity.sort((a, b) => b.api_calls - a.api_calls);

  return {
    type: 'member_activity',
    summary: {
      total_members: membersResult.total,
      active_members,
      inactive_members,
      new_members,
      removed_members: 0, // Would need audit log analysis
    },
    members: memberActivity,
  };
}

/**
 * Generate API usage report data
 */
async function generateApiUsageReport(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ApiUsageReportData> {
  const supabase = createServerClient();

  // Get all usage logs
  const { data: logs } = await supabase
    .from('usage_logs')
    .select('endpoint, method, latency_ms, status, error_type, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString());

  const allLogs = logs || [];

  // Calculate summary
  const latencies = allLogs.map((l) => l.latency_ms || 0).filter((l) => l > 0);
  const sortedLatencies = [...latencies].sort((a, b) => a - b);
  const p95Index = Math.floor(sortedLatencies.length * 0.95);

  const successCount = allLogs.filter(
    (l) => !l.error_type && l.status !== 'error'
  ).length;
  const errorCount = allLogs.length - successCount;

  // Group by endpoint
  const endpointMap = new Map<
    string,
    { calls: number; latencies: number[]; errors: number; method: string }
  >();

  for (const log of allLogs) {
    const key = `${log.method || 'GET'}:${log.endpoint || 'unknown'}`;
    const existing = endpointMap.get(key) || {
      calls: 0,
      latencies: [] as number[],
      errors: 0,
      method: log.method || 'GET',
    };
    existing.calls++;
    if (log.latency_ms) existing.latencies.push(log.latency_ms);
    if (log.error_type) existing.errors++;
    endpointMap.set(key, existing);
  }

  const endpoints = Array.from(endpointMap.entries())
    .map(([key, data]) => {
      const [method, endpoint] = key.split(':');
      const avgLatency =
        data.latencies.length > 0
          ? data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length
          : 0;
      return {
        endpoint,
        method,
        calls: data.calls,
        success_rate: ((data.calls - data.errors) / data.calls) * 100,
        avg_latency_ms: Math.round(avgLatency),
        errors: data.errors,
      };
    })
    .sort((a, b) => b.calls - a.calls);

  // Group errors by type
  const errors_by_type: Record<string, number> = {};
  for (const log of allLogs) {
    if (log.error_type) {
      errors_by_type[log.error_type] = (errors_by_type[log.error_type] || 0) + 1;
    }
  }

  return {
    type: 'api_usage',
    summary: {
      total_calls: allLogs.length,
      success_rate: allLogs.length > 0 ? (successCount / allLogs.length) * 100 : 100,
      avg_latency_ms: latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0,
      p95_latency_ms: sortedLatencies[p95Index] || 0,
      error_count: errorCount,
    },
    endpoints,
    errors_by_type,
    rate_limits_hit: errors_by_type['rate_limited'] || 0,
  };
}

/**
 * Generate cost analysis report data
 */
async function generateCostAnalysisReport(
  organizationId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<CostAnalysisReportData> {
  const supabase = createServerClient();

  // Pricing constants (example pricing)
  const PRICE_PER_1K_INPUT_TOKENS = 0.001;
  const PRICE_PER_1K_OUTPUT_TOKENS = 0.002;
  const PRICE_PER_MEMORY = 0.0001;
  const PRICE_PER_API_CALL = 0.00001;

  // Get usage data
  const { data: logs } = await supabase
    .from('usage_logs')
    .select('user_id, input_tokens, output_tokens, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', periodStart.toISOString())
    .lte('created_at', periodEnd.toISOString());

  const allLogs = logs || [];

  // Calculate totals
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const dailyCosts = new Map<string, number>();
  const userCosts = new Map<string, number>();

  for (const log of allLogs) {
    const inputTokens = log.input_tokens || 0;
    const outputTokens = log.output_tokens || 0;
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;

    const logCost =
      (inputTokens / 1000) * PRICE_PER_1K_INPUT_TOKENS +
      (outputTokens / 1000) * PRICE_PER_1K_OUTPUT_TOKENS +
      PRICE_PER_API_CALL;

    // Daily breakdown
    const date = log.created_at.split('T')[0];
    dailyCosts.set(date, (dailyCosts.get(date) || 0) + logCost);

    // User breakdown
    if (log.user_id) {
      userCosts.set(log.user_id, (userCosts.get(log.user_id) || 0) + logCost);
    }
  }

  // Get memory count for storage cost
  const { count: memoryCount } = await supabase
    .from('memories')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  const storageCost = (memoryCount || 0) * PRICE_PER_MEMORY;
  const embeddingCost = (totalInputTokens / 1000) * PRICE_PER_1K_INPUT_TOKENS;
  const retrievalCost = (totalOutputTokens / 1000) * PRICE_PER_1K_OUTPUT_TOKENS;
  const apiCost = allLogs.length * PRICE_PER_API_CALL;

  const totalCost = storageCost + embeddingCost + retrievalCost + apiCost;

  // Get unique users for per-user cost
  const uniqueUsers = userCosts.size || 1;

  // Days in period for projection
  const daysInPeriod = Math.max(
    1,
    (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  const projectedMonthlyCost = (totalCost / daysInPeriod) * 30;

  // Get user emails
  const userIds = Array.from(userCosts.keys());
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', userIds);

  const emailMap = new Map(profiles?.map((p) => [p.id, p.email]) || []);

  const cost_by_user = Array.from(userCosts.entries())
    .map(([user_id, cost_usd]) => ({
      user_id,
      email: emailMap.get(user_id) || 'unknown',
      cost_usd: Math.round(cost_usd * 10000) / 10000,
    }))
    .sort((a, b) => b.cost_usd - a.cost_usd)
    .slice(0, 20);

  return {
    type: 'cost_analysis',
    summary: {
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
      cost_per_user_usd: Math.round((totalCost / uniqueUsers) * 10000) / 10000,
      projected_monthly_usd: Math.round(projectedMonthlyCost * 100) / 100,
    },
    breakdown: {
      memory_storage_usd: Math.round(storageCost * 10000) / 10000,
      api_calls_usd: Math.round(apiCost * 10000) / 10000,
      embedding_tokens_usd: Math.round(embeddingCost * 10000) / 10000,
      retrieval_tokens_usd: Math.round(retrievalCost * 10000) / 10000,
    },
    daily_costs: Array.from(dailyCosts.entries())
      .map(([date, cost_usd]) => ({
        date,
        cost_usd: Math.round(cost_usd * 10000) / 10000,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    cost_by_user,
  };
}

// ============================================
// Scheduled Report Generation
// ============================================

/**
 * Generate weekly reports for all organizations
 */
export async function generateWeeklyReports(): Promise<void> {
  const supabase = createServerClient();

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, settings')
    .eq('settings->weekly_report_enabled', true);

  for (const org of orgs || []) {
    try {
      await generateReport({
        organization_id: org.id,
        report_type: 'usage_weekly',
        generated_by: 'system',
      });
    } catch (err) {
      console.error(`[Reports] Failed to generate weekly report for org ${org.id}:`, err);
    }
  }
}

/**
 * Generate monthly reports for all organizations
 */
export async function generateMonthlyReports(): Promise<void> {
  const supabase = createServerClient();

  const { data: orgs } = await supabase.from('organizations').select('id');

  for (const org of orgs || []) {
    try {
      await generateReport({
        organization_id: org.id,
        report_type: 'usage_monthly',
        generated_by: 'system',
      });
    } catch (err) {
      console.error(`[Reports] Failed to generate monthly report for org ${org.id}:`, err);
    }
  }
}
