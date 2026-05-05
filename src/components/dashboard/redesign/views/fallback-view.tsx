'use client';

import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';

export interface FallbackViewProps {
  tab: string;
}

export function FallbackView({ tab }: FallbackViewProps) {
  const { t } = useDashboardTranslation();
  const label = t(`dashboard.nav.${tab}`);
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div
          className="serif"
          style={{ fontSize: 24, fontStyle: 'italic', color: 'var(--text-tertiary)' }}
        >
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
          {t('dashboard.fallback.body')}
        </div>
      </div>
    </div>
  );
}
