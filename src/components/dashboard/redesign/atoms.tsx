import type { CSSProperties, ReactNode } from 'react';
import type { TagSize, TagTone } from './types';

interface ToneSpec {
  bg: string;
  fg: string;
  border: string;
}

const TONE_MAP: Record<TagTone, ToneSpec> = {
  ink: { bg: 'var(--ink-50)', fg: 'var(--ink-500)', border: 'var(--border-subtle)' },
  terracotta: {
    bg: 'var(--terracotta-50)',
    fg: 'var(--terracotta-700)',
    border: 'rgba(201, 100, 66, 0.25)',
  },
  dawn: {
    bg: 'var(--dawn-50)',
    fg: 'var(--dawn-700)',
    border: 'rgba(217, 168, 71, 0.30)',
  },
  cream: { bg: 'var(--ink-25)', fg: 'var(--ink-500)', border: 'var(--border-subtle)' },
  solid: { bg: 'var(--ink-900)', fg: 'var(--ink-25)', border: 'var(--ink-900)' },
};

export interface TagProps {
  children: ReactNode;
  tone?: TagTone;
  size?: TagSize;
  style?: CSSProperties;
}

export function Tag({ children, tone = 'ink', size = 'sm', style }: TagProps) {
  const palette = TONE_MAP[tone];
  const padding = size === 'xs' ? '1px 6px' : '2px 8px';
  const fontSize = size === 'xs' ? 10.5 : 11.5;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding,
        fontSize,
        fontWeight: 500,
        lineHeight: 1.4,
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export interface AvatarProps {
  name: string;
  color?: string;
  size?: number;
  ring?: boolean;
  style?: CSSProperties;
}

export function Avatar({ name, color = '#c96442', size = 28, ring = false, style }: AvatarProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.42,
        fontWeight: 600,
        fontFamily: 'var(--font-display-serif)',
        boxShadow: ring ? `0 0 0 2px var(--ink-25), 0 0 0 3.5px ${color}` : 'none',
        flexShrink: 0,
        ...style,
      }}
      aria-label={name}
    >
      {name.charAt(0)}
    </div>
  );
}

export interface KbdProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function Kbd({ children, style }: KbdProps) {
  return (
    <kbd
      className="mono"
      style={{
        fontSize: 10.5,
        padding: '1px 5px',
        borderRadius: 4,
        background: 'var(--ink-25)',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-tertiary)',
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </kbd>
  );
}

export interface SkelProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}

export function Skel({ width = '100%', height = 12, radius = 4, style }: SkelProps) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, rgba(74,67,56,.06), rgba(74,67,56,.10), rgba(74,67,56,.06))',
        backgroundSize: '200% 100%',
        animation: 'sk 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
