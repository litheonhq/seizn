import type { ReactNode } from 'react';

export interface SidebarGroupProps {
  label: string;
  collapsed: boolean;
  children: ReactNode;
}

export function SidebarGroup({ label, collapsed, children }: SidebarGroupProps) {
  if (collapsed) {
    return (
      <div
        style={{
          padding: '6px 0',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        {children}
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 0 4px' }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: '0.10em',
          color: 'var(--text-muted)',
          padding: '4px 16px 4px',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}
