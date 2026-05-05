import type { MemoryHealthState } from '../types';

export interface MemoryHealthProps {
  collapsed: boolean;
  state: MemoryHealthState;
  syncedLabel: string;
  syncingLabel: string;
  errorLabel: string;
  metaLabel: string;
}

const STATUS_COLOR: Record<MemoryHealthState['status'], string> = {
  synced: 'oklch(0.65 0.13 145)',
  syncing: 'var(--dawn-500)',
  error: 'var(--terracotta-500)',
};

const STATUS_RING: Record<MemoryHealthState['status'], string> = {
  synced: 'oklch(0.65 0.13 145 / 0.15)',
  syncing: 'rgba(217, 168, 71, 0.18)',
  error: 'rgba(201, 100, 66, 0.18)',
};

export function MemoryHealth({
  collapsed,
  state,
  syncedLabel,
  syncingLabel,
  errorLabel,
  metaLabel,
}: MemoryHealthProps) {
  const headline =
    state.status === 'synced'
      ? syncedLabel
      : state.status === 'syncing'
      ? syncingLabel
      : errorLabel;

  return (
    <div
      style={{
        margin: collapsed ? '0 8px 8px' : '0 12px 8px',
        padding: collapsed ? '8px 0' : '10px 12px',
        borderRadius: 10,
        background: 'var(--ink-25)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
      role="status"
      aria-live="polite"
    >
      <span
        className="dot-live"
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          background: STATUS_COLOR[state.status],
          boxShadow: `0 0 0 2px ${STATUS_RING[state.status]}`,
          flexShrink: 0,
        }}
      />
      {!collapsed && (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)' }}>
            {headline}
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{metaLabel}</div>
        </div>
      )}
    </div>
  );
}
