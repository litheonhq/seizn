'use client';

import Link from 'next/link';
import { type MouseEvent, useState } from 'react';
import { Kbd } from '../atoms';
import type { TopBarTab } from '../top-bar';
import type { Density } from '../types';
import type { NavItem } from './nav-config';

const AUTHOR_TABS: TopBarTab[] = [
  'inbox',
  'review',
  'characters',
  'graph',
  'timeline',
  'conflicts',
  'simulate',
  'audit',
];

export interface SidebarItemProps {
  item: NavItem;
  label: string;
  active: boolean;
  collapsed: boolean;
  density?: Density;
  badge?: number | string;
  showDot?: boolean;
  onSelect?: (tab: TopBarTab) => void;
}

function isAuthorTab(value: string | null): value is TopBarTab {
  return value != null && (AUTHOR_TABS as string[]).includes(value);
}

function getAuthorTab(href: string): TopBarTab | null {
  if (!href.startsWith('/dashboard/author?tab=')) return null;
  const tab = new URLSearchParams(href.split('?')[1] ?? '').get('tab');
  return isAuthorTab(tab) ? tab : null;
}

export function SidebarItem({
  item,
  label,
  active,
  collapsed,
  density = 'comfortable',
  badge,
  showDot = false,
  onSelect,
}: SidebarItemProps) {
  const [hover, setHover] = useState(false);
  const padY = density === 'compact' ? 4 : density === 'spacious' ? 8 : 6;
  const Icon = item.icon;
  const authorTab = getAuthorTab(item.href);

  const background = active
    ? 'rgba(201, 100, 66, 0.10)'
    : hover
    ? 'rgba(74, 67, 56, 0.05)'
    : 'transparent';

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!authorTab || !onSelect) return;
    event.preventDefault();
    onSelect(authorTab);
  };

  return (
    <Link
      href={item.href}
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      style={{
        textDecoration: 'none',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '8px' : `${padY}px 10px`,
        margin: collapsed ? '2px 0' : '1px 6px',
        borderRadius: 8,
        cursor: 'pointer',
        background,
        color: active ? 'var(--terracotta-700)' : 'var(--text-secondary)',
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        position: 'relative',
        transition: 'background .12s, color .12s',
      }}
    >
      {active && !collapsed && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: -6,
            top: 6,
            bottom: 6,
            width: 2.5,
            borderRadius: 2,
            background: 'var(--terracotta-500)',
          }}
        />
      )}
      <span
        style={{
          display: 'flex',
          color: active ? 'var(--terracotta-500)' : 'var(--text-tertiary)',
        }}
      >
        <Icon size={16} />
      </span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, letterSpacing: '-0.005em' }}>{label}</span>
          {showDot && (
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                background: 'var(--terracotta-500)',
              }}
            />
          )}
          {badge != null && (
            <span
              style={{
                fontSize: 10.5,
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
                color: active ? 'var(--terracotta-700)' : 'var(--text-muted)',
                minWidth: 16,
                textAlign: 'right',
              }}
            >
              {badge}
            </span>
          )}
          {hover && item.kbd && badge == null && (
            <Kbd style={{ fontSize: 9.5, padding: '0 4px' }}>{item.kbd}</Kbd>
          )}
        </>
      )}
    </Link>
  );
}
