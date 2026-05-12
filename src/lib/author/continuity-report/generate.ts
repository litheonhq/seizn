/**
 * Monthly Continuity Report generator (Pro+ Managed entitlement).
 *
 * Locked 2026-05-08. Aggregates the user's last calendar month of activity
 * across imports, characters, conflicts, and feature usage, then renders
 * a markdown summary and uploads it to R2.
 *
 * This generator is intentionally LLM-free: every section is derived from
 * structured DB rows. A future iteration may layer an LLM-driven
 * "highlights" section on top, but the data summary itself ships from day
 * one so Pro+ users see deterministic value at the predicted $0 cost.
 */

import type { createServerClient } from '@/lib/supabase';
import { AuthorR2Store } from '@/lib/author/storage/r2-store';

interface ImportRow {
  id: string;
  project_id: string;
  file_name: string;
  source_role: string;
  candidate_count: number;
  created_at: string;
}

interface CharacterRow {
  project_id: string;
  name: string;
  archetype: string;
  updated_at: string;
}

interface ConflictRow {
  project_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved';
  conflict_key: string;
  payload: unknown;
  created_at: string;
  resolved_at: string | null;
}

interface FeatureUsageRow {
  feature: string;
  count: number;
  period_start: string;
}

export interface ContinuityReportOutput {
  markdown: string;
  r2Key: string;
  bytes: number;
}

export async function generateContinuityReport(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  scheduledFor: string,
): Promise<ContinuityReportOutput> {
  const { periodStartIso, periodEndIso, periodLabel } =
    monthWindowEndingOn(scheduledFor);

  const [imports, characters, conflicts, featureUsage] = await Promise.all([
    fetchImports(supabase, userId, periodStartIso, periodEndIso),
    fetchCharacters(supabase, userId),
    fetchConflicts(supabase, userId, periodStartIso, periodEndIso),
    fetchFeatureUsage(supabase, userId, periodStartIso),
  ]);

  const markdown = renderMarkdown({
    userId,
    periodLabel,
    periodStartIso,
    periodEndIso,
    imports,
    characters,
    conflicts,
    featureUsage,
  });

  const r2Key = `continuity-reports/${userId}/${scheduledFor}.md`;
  const body = Buffer.from(markdown, 'utf8');
  const store = new AuthorR2Store();
  await store.putObject({
    key: r2Key,
    body,
    contentType: 'text/markdown; charset=utf-8',
    metadata: { user_id: userId, scheduled_for: scheduledFor },
  });

  return { markdown, r2Key, bytes: body.byteLength };
}

async function fetchImports(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<ImportRow[]> {
  const { data } = await supabase
    .from('author_imports')
    .select('id, project_id, file_name, source_role, candidate_count, created_at')
    .eq('user_id', userId)
    .gte('created_at', startIso)
    .lt('created_at', endIso)
    .order('created_at', { ascending: false })
    .limit(200);
  return (data ?? []) as ImportRow[];
}

async function fetchCharacters(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<CharacterRow[]> {
  const { data } = await supabase
    .from('author_characters')
    .select('project_id, name, archetype, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50);
  return (data ?? []) as CharacterRow[];
}

async function fetchConflicts(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  startIso: string,
  endIso: string,
): Promise<ConflictRow[]> {
  // Pull anything either created OR resolved during the window, plus all
  // currently-open critical/high conflicts so the report surfaces unresolved
  // burning issues even if they pre-date the window.
  const { data: windowed } = await supabase
    .from('author_conflicts')
    .select('project_id, severity, status, conflict_key, payload, created_at, resolved_at')
    .eq('user_id', userId)
    .or(`and(created_at.gte.${startIso},created_at.lt.${endIso}),and(resolved_at.gte.${startIso},resolved_at.lt.${endIso})`)
    .order('created_at', { ascending: false })
    .limit(200);

  const { data: openCritical } = await supabase
    .from('author_conflicts')
    .select('project_id, severity, status, conflict_key, payload, created_at, resolved_at')
    .eq('user_id', userId)
    .eq('status', 'open')
    .in('severity', ['high', 'critical'])
    .order('created_at', { ascending: false })
    .limit(50);

  const merged = new Map<string, ConflictRow>();
  for (const row of [...((windowed ?? []) as ConflictRow[]), ...((openCritical ?? []) as ConflictRow[])]) {
    merged.set(`${row.project_id}::${row.conflict_key}`, row);
  }
  return Array.from(merged.values());
}

async function fetchFeatureUsage(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  periodStartIso: string,
): Promise<FeatureUsageRow[]> {
  // Period start is the first day of the report month. feature_usage_log is
  // keyed on (user_id, feature, period_start). Match exact period.
  const periodStartDate = periodStartIso.slice(0, 10);
  const { data } = await supabase
    .from('feature_usage_log')
    .select('feature, count, period_start')
    .eq('user_id', userId)
    .eq('period_start', periodStartDate);
  return (data ?? []) as FeatureUsageRow[];
}

interface RenderInput {
  userId: string;
  periodLabel: string;
  periodStartIso: string;
  periodEndIso: string;
  imports: ImportRow[];
  characters: CharacterRow[];
  conflicts: ConflictRow[];
  featureUsage: FeatureUsageRow[];
}

function renderMarkdown(input: RenderInput): string {
  const sections: string[] = [];

  sections.push(`# Monthly Continuity Report — ${input.periodLabel}`);
  sections.push('');
  sections.push(
    `_Generated for user \`${input.userId}\` covering ${input.periodStartIso.slice(0, 10)} → ${input.periodEndIso.slice(0, 10)}._`,
  );
  sections.push('');

  // Section 1: Activity summary
  const importsByProject = groupByProject(input.imports);
  const totalCandidates = input.imports.reduce(
    (sum, row) => sum + (row.candidate_count ?? 0),
    0,
  );
  sections.push('## Activity summary');
  sections.push('');
  sections.push(`- **Imports this month:** ${input.imports.length}`);
  sections.push(`- **Candidate facts extracted:** ${totalCandidates}`);
  sections.push(`- **Active projects:** ${importsByProject.size}`);
  sections.push(`- **Characters in roster:** ${input.characters.length}`);
  sections.push('');

  // Section 2: Feature usage
  if (input.featureUsage.length > 0) {
    sections.push('## Feature usage');
    sections.push('');
    sections.push('| Feature | Calls |');
    sections.push('|---|---|');
    const sortedUsage = [...input.featureUsage].sort((a, b) => b.count - a.count);
    for (const row of sortedUsage) {
      sections.push(`| ${escapeCell(row.feature)} | ${row.count} |`);
    }
    sections.push('');
  }

  // Section 3: Imports detail (top 25)
  if (input.imports.length > 0) {
    sections.push('## Imports this month');
    sections.push('');
    sections.push('| Date | Project | File | Role | Candidates |');
    sections.push('|---|---|---|---|---|');
    for (const row of input.imports.slice(0, 25)) {
      sections.push(
        `| ${row.created_at.slice(0, 10)} | ${escapeCell(row.project_id)} | ${escapeCell(row.file_name)} | ${escapeCell(row.source_role)} | ${row.candidate_count ?? 0} |`,
      );
    }
    if (input.imports.length > 25) {
      sections.push('');
      sections.push(`_…and ${input.imports.length - 25} more imports omitted._`);
    }
    sections.push('');
  }

  // Section 4: Conflicts
  const openConflicts = input.conflicts.filter((c) => c.status === 'open');
  const resolvedConflicts = input.conflicts.filter((c) => c.status === 'resolved');
  const openBySeverity = countBySeverity(openConflicts);

  sections.push('## Continuity conflicts');
  sections.push('');
  sections.push(
    `- **Open:** ${openConflicts.length} (critical ${openBySeverity.critical}, high ${openBySeverity.high}, medium ${openBySeverity.medium}, low ${openBySeverity.low})`,
  );
  sections.push(`- **Resolved this month:** ${resolvedConflicts.length}`);
  sections.push('');

  const criticalAndHigh = openConflicts
    .filter((c) => c.severity === 'critical' || c.severity === 'high')
    .sort(severityOrder);
  if (criticalAndHigh.length > 0) {
    sections.push('### Top open issues');
    sections.push('');
    sections.push('| Severity | Project | Conflict |');
    sections.push('|---|---|---|');
    for (const conflict of criticalAndHigh.slice(0, 20)) {
      sections.push(
        `| ${conflict.severity} | ${escapeCell(conflict.project_id)} | ${escapeCell(summarizeConflict(conflict))} |`,
      );
    }
    sections.push('');
  }

  // Section 5: Character roster (top 20 by recency)
  if (input.characters.length > 0) {
    sections.push('## Recent character activity');
    sections.push('');
    sections.push('| Name | Project | Archetype | Last updated |');
    sections.push('|---|---|---|---|');
    for (const char of input.characters.slice(0, 20)) {
      sections.push(
        `| ${escapeCell(char.name)} | ${escapeCell(char.project_id)} | ${escapeCell(char.archetype || '—')} | ${char.updated_at.slice(0, 10)} |`,
      );
    }
    sections.push('');
  }

  sections.push('---');
  sections.push(
    `_Generated by Seizn Author Memory v3 on ${new Date().toISOString()}. Reports are delivered monthly to Pro+ Managed subscribers._`,
  );

  return sections.join('\n');
}

function monthWindowEndingOn(scheduledFor: string): {
  periodStartIso: string;
  periodEndIso: string;
  periodLabel: string;
} {
  // continuity_reports.scheduled_for is the first day of the month for which
  // the report is generated. Window covers that calendar month in UTC.
  const [yearStr, monthStr] = scheduledFor.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`invalid scheduled_for date: ${scheduledFor}`);
  }
  // Report covers the month BEFORE scheduled_for (the month that just ended).
  // E.g., scheduled_for=2026-06-01 → report for May 2026.
  const reportMonth = month - 1;
  const reportYear = reportMonth < 1 ? year - 1 : year;
  const normalizedMonth = ((reportMonth - 1 + 12) % 12) + 1;
  const start = new Date(Date.UTC(reportYear, normalizedMonth - 1, 1));
  const end = new Date(Date.UTC(reportYear, normalizedMonth, 1));
  const monthName = start.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return {
    periodStartIso: start.toISOString(),
    periodEndIso: end.toISOString(),
    periodLabel: `${monthName} ${reportYear}`,
  };
}

function groupByProject<T extends { project_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(row.project_id) ?? [];
    list.push(row);
    map.set(row.project_id, list);
  }
  return map;
}

function countBySeverity(conflicts: ConflictRow[]): {
  critical: number;
  high: number;
  medium: number;
  low: number;
} {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const c of conflicts) counts[c.severity] += 1;
  return counts;
}

function severityOrder(a: ConflictRow, b: ConflictRow): number {
  const order: Record<ConflictRow['severity'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return order[a.severity] - order[b.severity];
}

function summarizeConflict(conflict: ConflictRow): string {
  // payload shape varies; pull a `description` or `message` field if present,
  // otherwise fall back to the conflict_key so the table cell is informative.
  if (conflict.payload && typeof conflict.payload === 'object') {
    const payload = conflict.payload as Record<string, unknown>;
    const candidate =
      typeof payload.description === 'string'
        ? payload.description
        : typeof payload.message === 'string'
          ? payload.message
          : typeof payload.summary === 'string'
            ? payload.summary
            : null;
    if (candidate) return candidate.slice(0, 140);
  }
  return conflict.conflict_key;
}

function escapeCell(value: string | null | undefined): string {
  if (!value) return '';
  // Markdown table cells: escape `|` and collapse newlines.
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}
