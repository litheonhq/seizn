import type { DashboardTranslate } from './types';

export function classifyAnalyzeError(error: unknown, t: DashboardTranslate): string {
  if (!error) return t('dashboard.coach.error.unknown');
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error);
  const lower = raw.toLowerCase();
  if (lower.includes('available on indie plans') || lower.includes('feature limit')) {
    return raw;
  }
  if (lower.includes('temporarily disabled')) {
    return raw;
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('typeerror: load failed')
  ) {
    return t('dashboard.coach.error.network');
  }
  if (lower.includes('text is required')) {
    return t('dashboard.coach.error.empty');
  }
  if (lower.includes('csrf')) {
    return t('dashboard.coach.error.csrf');
  }
  return raw || t('dashboard.coach.error.unknown');
}
