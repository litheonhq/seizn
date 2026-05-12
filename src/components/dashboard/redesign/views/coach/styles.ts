import type { CSSProperties } from 'react';
import type { AntiClicheCategory } from '@/lib/author/frameworks';

export const editorBaseStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  padding: '20px 22px',
  borderRadius: 12,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-primary)',
  fontFamily: 'inherit',
  fontSize: 14.5,
  lineHeight: 1.65,
  color: 'var(--text-primary)',
  whiteSpace: 'pre-wrap',
  wordWrap: 'break-word',
  overflow: 'auto',
  overflowWrap: 'break-word',
  pointerEvents: 'none',
  margin: 0,
};

export const listReset: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

export const listItem: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
};

export const listItemBody: CSSProperties = {
  margin: '4px 0 0',
  fontSize: 12.5,
  lineHeight: 1.55,
  color: 'var(--text-secondary)',
};

export const listItemHint: CSSProperties = {
  margin: '6px 0 0',
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--text-tertiary)',
  fontStyle: 'italic',
};

export const listItemKbd: CSSProperties = {
  marginTop: 6,
  fontSize: 10.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
};

export const clicheButtonStyle: CSSProperties = {
  appearance: 'none',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  outline: 'none',
  padding: '10px 36px 10px 12px',
  width: '100%',
  textAlign: 'left',
  font: 'inherit',
  color: 'inherit',
  display: 'block',
  borderRadius: 8,
};

export const clicheDismissStyle: CSSProperties = {
  position: 'absolute',
  top: 8,
  right: 8,
  width: 24,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 999,
  border: 'none',
  background: 'rgba(122, 92, 58, 0.10)',
  color: 'var(--text-tertiary)',
  cursor: 'pointer',
};

export const kbdHintStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  padding: '2px 6px',
  borderRadius: 4,
  // Solid 50% white tile + near-opaque text → contrast ratio against the
  // terracotta button background reads above 4.5:1 (WCAG AA).
  background: 'rgba(255, 255, 255, 0.92)',
  color: 'var(--terracotta-500)',
};

export function categoryBadge(category: AntiClicheCategory): CSSProperties {
  const palette: Record<AntiClicheCategory, string> = {
    opening: 'rgba(122, 92, 58, 0.18)',
    emotional: 'rgba(201, 100, 66, 0.18)',
    description: 'rgba(216, 168, 109, 0.22)',
    action: 'rgba(122, 92, 58, 0.18)',
    dialogue: 'rgba(112, 130, 152, 0.20)',
    ai_specific: 'rgba(201, 100, 66, 0.26)',
  };
  return {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    padding: '2px 8px',
    borderRadius: 999,
    background: palette[category],
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  };
}
