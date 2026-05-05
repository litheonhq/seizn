'use client';

import type { ReactNode } from 'react';
import type { Severity } from './types';

interface SeverityPalette {
  bg: string;
  border: string;
  text: string;
  labelKey: 'p1' | 'p2' | 'p3';
}

const SEVERITY_MAP: Record<Severity, SeverityPalette> = {
  P1: {
    bg: 'var(--sev-p1-bg)',
    border: 'var(--sev-p1-border)',
    text: 'var(--sev-p1-text)',
    labelKey: 'p1',
  },
  P2: {
    bg: 'var(--sev-p2-bg)',
    border: 'var(--sev-p2-border)',
    text: 'var(--sev-p2-text)',
    labelKey: 'p2',
  },
  P3: {
    bg: 'var(--sev-p3-bg)',
    border: 'var(--sev-p3-border)',
    text: 'var(--sev-p3-text)',
    labelKey: 'p3',
  },
};

export interface ConflictCardProps {
  severity?: Severity;
  kind: ReactNode;
  title: ReactNode;
  episode: ReactNode;
  why?: ReactNode;
  refs?: string[];
  compact?: boolean;
  severityLabel: ReactNode;
  resolveLabel: ReactNode;
  openEvidenceLabel: ReactNode;
  dismissLabel: ReactNode;
  onResolve?: () => void;
  onOpenEvidence?: () => void;
  onDismiss?: () => void;
}

export function ConflictCard({
  severity = 'P1',
  kind,
  title,
  episode,
  why,
  refs = [],
  compact = false,
  severityLabel,
  resolveLabel,
  openEvidenceLabel,
  dismissLabel,
  onResolve,
  onOpenEvidence,
  onDismiss,
}: ConflictCardProps) {
  const sev = SEVERITY_MAP[severity];

  return (
    <article
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: 'var(--shadow-card)',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: 3,
          background: sev.border,
        }}
      />
      <div
        style={{
          padding: '12px 16px 8px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: sev.bg,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: '0.10em',
            color: sev.text,
            textTransform: 'uppercase',
          }}
        >
          {severity} · {severityLabel}
        </span>
        <span
          style={{
            width: 3,
            height: 3,
            borderRadius: 2,
            background: sev.text,
            opacity: 0.5,
          }}
        />
        <span style={{ fontSize: 11.5, color: sev.text, fontWeight: 500 }}>{kind}</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10.5, color: sev.text }}>
          {episode}
        </span>
      </div>
      <div style={{ padding: '14px 18px 16px' }}>
        <h3
          className="serif"
          style={{
            fontSize: compact ? 15 : 17,
            fontWeight: 500,
            lineHeight: 1.3,
            margin: 0,
            letterSpacing: '-0.015em',
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h3>
        {why && (
          <p
            style={{
              fontSize: 12.5,
              lineHeight: 1.55,
              color: 'var(--text-tertiary)',
              margin: '8px 0 0',
            }}
          >
            {why}
          </p>
        )}
        {refs.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginTop: 12,
              flexWrap: 'wrap',
            }}
          >
            {refs.map((r) => (
              <span
                key={r}
                className="mono"
                style={{
                  fontSize: 10.5,
                  padding: '2px 7px',
                  borderRadius: 5,
                  background: 'var(--ink-25)',
                  color: 'var(--text-tertiary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {r}
              </span>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onResolve}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '6px 12px',
              background: 'var(--ink-900)',
              color: 'var(--ink-25)',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {resolveLabel}
          </button>
          <button
            type="button"
            onClick={onOpenEvidence}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '6px 12px',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {openEvidenceLabel}
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onDismiss}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontSize: 11.5,
              color: 'var(--text-muted)',
              fontWeight: 500,
            }}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </article>
  );
}
