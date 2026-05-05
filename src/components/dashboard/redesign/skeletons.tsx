import { Skel } from './atoms';

export function SkeletonInbox({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Skel width={48} height={14} radius={4} />
            <Skel width={36} height={12} radius={4} />
          </div>
          <Skel width="92%" height={14} style={{ marginBottom: 6 }} />
          <Skel width="60%" height={11} />
        </div>
      ))}
    </div>
  );
}
