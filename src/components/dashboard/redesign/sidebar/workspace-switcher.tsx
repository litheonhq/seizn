'use client';

import { ChevronDownIcon } from '../icons';

export interface WorkspaceSwitcherProps {
  collapsed: boolean;
  workspaceName: string;
  planLabel: string;
  entriesLabel: string;
  initial?: string;
  onClick?: () => void;
  hasMore?: boolean;
}

export function WorkspaceSwitcher({
  collapsed,
  workspaceName,
  planLabel,
  entriesLabel,
  initial,
  onClick,
  hasMore = false,
}: WorkspaceSwitcherProps) {
  const badgeChar = (initial ?? workspaceName.charAt(0) ?? 'S').toUpperCase();
  const ChevDown = ChevronDownIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!hasMore && !onClick}
      aria-label={workspaceName}
      style={{
        all: 'unset',
        margin: collapsed ? '12px 8px' : '12px',
        padding: collapsed ? 0 : '10px 12px',
        borderRadius: 10,
        background: collapsed ? 'transparent' : 'var(--ink-25)',
        border: collapsed ? 'none' : '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        cursor: hasMore || onClick ? 'pointer' : 'default',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: collapsed ? 32 : 28,
          height: collapsed ? 32 : 28,
          borderRadius: 8,
          background: 'linear-gradient(135deg, var(--ink-900), var(--ink-700))',
          color: 'var(--ink-25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-display-serif)',
          fontSize: collapsed ? 16 : 14,
          fontWeight: 500,
          fontStyle: 'italic',
          flexShrink: 0,
        }}
      >
        {badgeChar}
      </span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span
              className="serif"
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.012em',
              }}
            >
              {workspaceName}
            </span>
            <span
              style={{
                display: 'flex',
                fontSize: 10.5,
                color: 'var(--text-muted)',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <span>{planLabel}</span>
              <span
                aria-hidden="true"
                style={{
                  width: 2,
                  height: 2,
                  borderRadius: 1,
                  background: 'currentColor',
                  opacity: 0.5,
                }}
              />
              <span>{entriesLabel}</span>
            </span>
          </span>
          {hasMore && (
            <span
              style={{ color: 'var(--text-muted)', display: 'flex' }}
              aria-hidden="true"
            >
              <ChevDown size={14} />
            </span>
          )}
        </>
      )}
    </button>
  );
}
