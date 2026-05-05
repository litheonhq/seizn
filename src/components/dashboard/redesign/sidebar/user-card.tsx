import { Avatar } from '../atoms';
import { MoreIcon } from '../icons';

export interface UserCardProps {
  collapsed: boolean;
  name: string;
  planLabel: string;
  avatarColor?: string;
  onMore?: () => void;
}

export function UserCard({
  collapsed,
  name,
  planLabel,
  avatarColor = '#a94e2f',
  onMore,
}: UserCardProps) {
  return (
    <div
      style={{
        margin: collapsed ? '8px 8px 12px' : '8px 12px 12px',
        padding: collapsed ? 0 : '8px 10px',
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'transparent',
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
    >
      <Avatar name={name} color={avatarColor} size={collapsed ? 30 : 26} />
      {!collapsed && (
        <>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>
              {name}
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{planLabel}</div>
          </div>
          <button
            type="button"
            onClick={onMore}
            aria-label="More"
            style={{
              all: 'unset',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
            }}
          >
            <MoreIcon size={16} />
          </button>
        </>
      )}
    </div>
  );
}
