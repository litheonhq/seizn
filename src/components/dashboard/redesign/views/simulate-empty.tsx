'use client';

import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { EmptyState } from '../empty-state';

export function SimulateEmpty() {
  const { t } = useDashboardTranslation();
  return (
    <div style={{ flex: 1, background: 'var(--bg-elevated)' }}>
      <EmptyState
        kind="graph"
        title={t('dashboard.simulate.empty')}
        body={t('dashboard.simulate.empty.body')}
        primary={t('dashboard.simulate.empty.cta')}
        hints={[
          { k: '⌘ N', t: t('dashboard.simulate.hint.new') },
          { k: '?', t: t('dashboard.simulate.hint.help') },
        ]}
      />
    </div>
  );
}
