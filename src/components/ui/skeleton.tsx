import { cn } from '@/lib/utils';

/**
 * Base Skeleton Component
 *
 * Animated placeholder for loading states.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

/**
 * Text Skeleton - Single line of text
 */
export function TextSkeleton({
  width = 'w-full',
  className,
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={cn('h-4', width, className)} />;
}

/**
 * Heading Skeleton - Larger text
 */
export function HeadingSkeleton({
  size = 'md',
  width = 'w-3/4',
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  width?: string;
  className?: string;
}) {
  const heights = {
    sm: 'h-5',
    md: 'h-6',
    lg: 'h-8',
    xl: 'h-10',
  };

  return <Skeleton className={cn(heights[size], width, className)} />;
}

/**
 * Paragraph Skeleton - Multiple lines
 */
export function ParagraphSkeleton({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  const widths = ['w-full', 'w-5/6', 'w-4/5', 'w-3/4', 'w-2/3'];

  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', widths[i % widths.length])}
        />
      ))}
    </div>
  );
}

/**
 * Avatar Skeleton - Circular placeholder
 */
export function AvatarSkeleton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16',
  };

  return <Skeleton className={cn('rounded-full', sizes[size], className)} />;
}

/**
 * Button Skeleton
 */
export function ButtonSkeleton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizes = {
    sm: 'h-8 w-20',
    md: 'h-10 w-24',
    lg: 'h-12 w-32',
  };

  return <Skeleton className={cn('rounded-md', sizes[size], className)} />;
}

/**
 * Card Skeleton - Basic card placeholder
 */
export function CardSkeleton({
  hasImage = false,
  className,
}: {
  hasImage?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-4 space-y-4',
        className
      )}
    >
      {hasImage && <Skeleton className="h-40 w-full rounded-md" />}
      <div className="space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <ParagraphSkeleton lines={2} />
    </div>
  );
}

/**
 * Table Row Skeleton
 */
export function TableRowSkeleton({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-4 py-3', className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4',
            i === 0 ? 'w-24' : i === columns - 1 ? 'w-16' : 'flex-1'
          )}
        />
      ))}
    </div>
  );
}

/**
 * Table Skeleton
 */
export function TableSkeleton({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('divide-y', className)}>
      {/* Header */}
      <TableRowSkeleton columns={columns} className="font-medium" />
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} columns={columns} />
      ))}
    </div>
  );
}

/**
 * List Item Skeleton
 */
export function ListItemSkeleton({
  hasAvatar = true,
  hasAction = false,
  className,
}: {
  hasAvatar?: boolean;
  hasAction?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-3 py-3', className)}>
      {hasAvatar && <AvatarSkeleton size="md" />}
      <div className="flex-1 space-y-1">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      {hasAction && <Skeleton className="h-8 w-8 rounded-md" />}
    </div>
  );
}

/**
 * List Skeleton
 */
export function ListSkeleton({
  items = 5,
  hasAvatar = true,
  hasAction = false,
  className,
}: {
  items?: number;
  hasAvatar?: boolean;
  hasAction?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('divide-y', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <ListItemSkeleton key={i} hasAvatar={hasAvatar} hasAction={hasAction} />
      ))}
    </div>
  );
}

/**
 * Form Field Skeleton
 */
export function FormFieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}

/**
 * Form Skeleton
 */
export function FormSkeleton({
  fields = 4,
  hasSubmit = true,
  className,
}: {
  fields?: number;
  hasSubmit?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <FormFieldSkeleton key={i} />
      ))}
      {hasSubmit && (
        <div className="flex justify-end">
          <ButtonSkeleton size="md" />
        </div>
      )}
    </div>
  );
}

/**
 * Chart Skeleton
 */
export function ChartSkeleton({
  type = 'bar',
  className,
}: {
  type?: 'bar' | 'line' | 'pie';
  className?: string;
}) {
  if (type === 'pie') {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <Skeleton className="h-48 w-48 rounded-full" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-end gap-2 h-40">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1"
            style={{ height: `${Math.random() * 60 + 40}%` }}
          />
        ))}
      </div>
      <Skeleton className="h-4 w-full" />
    </div>
  );
}

/**
 * Stat Card Skeleton
 */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-4 space-y-2', className)}>
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

/**
 * Dashboard Stats Skeleton
 */
export function DashboardStatsSkeleton({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-4 grid-cols-2 md:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Navigation Skeleton
 */
export function NavSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <Skeleton className="h-8 w-8 rounded-md" />
      <Skeleton className="h-5 w-24" />
      <div className="flex-1" />
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  );
}

/**
 * Sidebar Skeleton
 */
export function SidebarSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6 p-4', className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <div className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}
