'use client';

import { useDashboardTranslation } from '@/contexts/DashboardLocaleContext';
import { getAuthorTabLabelKey } from '@/lib/dashboard-routes';
import { SparkIcon } from '../icons';

export interface FallbackViewProps {
  tab: string;
}

export function FallbackView({ tab }: FallbackViewProps) {
  const { t } = useDashboardTranslation();
  const label = t(getAuthorTabLabelKey(tab));
  return (
    <div
      style={{
        flex: 1,
        background:
          'radial-gradient(circle at 50% 30%, rgba(216, 168, 109, 0.10), transparent 55%), var(--bg-elevated)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          maxWidth: 460,
          width: '100%',
          padding: '40px 36px',
          borderRadius: 16,
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-primary)',
          boxShadow: '0 24px 60px -32px rgba(40, 30, 20, 0.18)',
          textAlign: 'center',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            margin: '0 auto 18px',
            display: 'grid',
            placeItems: 'center',
            background:
              'linear-gradient(140deg, rgba(216, 168, 109, 0.22), rgba(201, 100, 66, 0.12))',
            color: 'var(--terracotta-500)',
          }}
        >
          <SparkIcon size={22} />
        </div>
        <div
          style={{
            display: 'inline-block',
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--terracotta-500)',
            padding: '3px 10px',
            borderRadius: 999,
            background: 'rgba(201, 100, 66, 0.10)',
            marginBottom: 14,
          }}
        >
          In development
        </div>
        <div
          className="serif"
          style={{
            fontSize: 28,
            fontWeight: 500,
            fontStyle: 'italic',
            letterSpacing: '-0.015em',
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            color: 'var(--text-tertiary)',
            maxWidth: 360,
            margin: '0 auto',
          }}
        >
          {t('dashboard.fallback.body')}
        </div>
      </div>
    </div>
  );
}
