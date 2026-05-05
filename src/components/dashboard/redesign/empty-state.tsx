import type { ReactNode } from 'react';
import { Kbd } from './atoms';
import { PlusIcon } from './icons';
import type { EmptyKind } from './types';

export interface EmptyIllustrationProps {
  kind?: EmptyKind;
}

export function EmptyIllustration({ kind = 'characters' }: EmptyIllustrationProps) {
  const stroke = 'rgba(74,67,56,.35)';
  const accent = 'var(--terracotta-500)';

  if (kind === 'characters') {
    return (
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
        <rect x="20" y="30" width="80" height="56" rx="3" stroke={stroke} strokeWidth="1.4" />
        <line x1="20" y1="44" x2="100" y2="44" stroke={stroke} strokeWidth="1.4" />
        <circle cx="36" cy="60" r="6" stroke={stroke} strokeWidth="1.4" />
        <line x1="48" y1="58" x2="86" y2="58" stroke={stroke} strokeWidth="1.4" />
        <line x1="48" y1="64" x2="76" y2="64" stroke={stroke} strokeWidth="1.4" opacity=".6" />
        <circle
          cx="36"
          cy="76"
          r="6"
          stroke={stroke}
          strokeWidth="1.4"
          strokeDasharray="2 2"
        />
        <line
          x1="48"
          y1="74"
          x2="86"
          y2="74"
          stroke={stroke}
          strokeWidth="1.4"
          strokeDasharray="2 2"
        />
        <line
          x1="48"
          y1="80"
          x2="70"
          y2="80"
          stroke={stroke}
          strokeWidth="1.4"
          strokeDasharray="2 2"
          opacity=".6"
        />
        <circle cx="92" cy="22" r="7" fill={accent} opacity=".15" />
        <circle cx="92" cy="22" r="3" fill={accent} />
      </svg>
    );
  }

  if (kind === 'inbox') {
    return (
      <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
        <path
          d="M22 38 L60 22 L98 38 L98 78 Q98 82 94 82 L26 82 Q22 82 22 78 Z"
          stroke={stroke}
          strokeWidth="1.4"
        />
        <path d="M22 38 L60 60 L98 38" stroke={stroke} strokeWidth="1.4" />
        <circle cx="60" cy="38" r="2.5" fill={accent} />
      </svg>
    );
  }

  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <line x1="40" y1="40" x2="80" y2="40" stroke={stroke} strokeWidth="1.4" />
      <line x1="40" y1="40" x2="50" y2="74" stroke={stroke} strokeWidth="1.4" />
      <line x1="80" y1="40" x2="74" y2="74" stroke={stroke} strokeWidth="1.4" />
      <circle cx="40" cy="40" r="9" fill="var(--ink-25)" stroke={stroke} strokeWidth="1.4" />
      <circle cx="80" cy="40" r="9" fill="var(--ink-25)" stroke={stroke} strokeWidth="1.4" />
      <circle
        cx="50"
        cy="74"
        r="6"
        fill={accent}
        fillOpacity=".18"
        stroke={accent}
        strokeWidth="1.4"
      />
      <circle
        cx="74"
        cy="74"
        r="6"
        fill="var(--ink-25)"
        stroke={stroke}
        strokeWidth="1.4"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

export interface EmptyHint {
  k: ReactNode;
  t: ReactNode;
}

export interface EmptyStateProps {
  kind?: EmptyKind;
  title: ReactNode;
  body?: ReactNode;
  primary?: ReactNode;
  onPrimary?: () => void;
  hints?: EmptyHint[];
}

export function EmptyState({
  kind = 'characters',
  title,
  body,
  primary,
  onPrimary,
  hints = [],
}: EmptyStateProps) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 40,
      }}
    >
      <EmptyIllustration kind={kind} />
      <h3
        className="serif"
        style={{
          fontSize: 22,
          fontWeight: 500,
          fontStyle: 'italic',
          letterSpacing: '-0.018em',
          margin: '20px 0 6px',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </h3>
      {body && (
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.55,
            margin: 0,
            maxWidth: 360,
            color: 'var(--text-tertiary)',
          }}
        >
          {body}
        </p>
      )}
      {primary && (
        <button
          type="button"
          onClick={onPrimary}
          style={{
            all: 'unset',
            cursor: 'pointer',
            marginTop: 18,
            padding: '8px 14px',
            background: 'var(--ink-900)',
            color: 'var(--ink-25)',
            borderRadius: 7,
            fontSize: 12.5,
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <PlusIcon size={14} />
          {primary}
        </button>
      )}
      {hints.length > 0 && (
        <div
          style={{
            marginTop: 24,
            display: 'flex',
            gap: 18,
            fontSize: 11.5,
            color: 'var(--text-muted)',
          }}
        >
          {hints.map((h, i) => (
            <span
              key={i}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Kbd style={{ fontSize: 9.5 }}>{h.k}</Kbd> {h.t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
