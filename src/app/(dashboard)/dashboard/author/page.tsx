import DashboardShell from '@/components/dashboard/DashboardShell';
import { AuthorMemoryV3Client } from './author-memory-v3-client';

export default function AuthorMemoryV3Page() {
  return (
    <DashboardShell>
      <AuthorMemoryV3Client />
    </DashboardShell>
  );
}
