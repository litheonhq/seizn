/**
 * Seizn Domain-Specific Skeleton Components
 *
 * Exports all skeleton components for progressive loading states.
 *
 * @module components/skeletons
 */

export * from './memory-skeletons';
export * from './dashboard-skeletons';
export * from './search-skeletons';
export * from './graph-skeletons';

// Re-export base skeletons for convenience
export {
  Skeleton,
  TextSkeleton,
  HeadingSkeleton,
  ParagraphSkeleton,
  AvatarSkeleton,
  ButtonSkeleton,
  CardSkeleton,
  TableSkeleton,
  ListSkeleton,
  FormSkeleton,
  ChartSkeleton,
  StatCardSkeleton,
  DashboardStatsSkeleton,
  NavSkeleton,
  SidebarSkeleton,
} from '@/components/ui/skeleton';
