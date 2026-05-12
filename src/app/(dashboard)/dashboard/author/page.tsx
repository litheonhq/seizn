import { redirect } from 'next/navigation';
import { WorkspaceShell } from '@/components/dashboard/redesign/workspace-shell';
import { getAuthOrReview } from '@/lib/auth-or-review';
import { isAuthorUiAccessAllowed } from '@/lib/author/ui/route';
import { getDashboardCapabilities } from '@/lib/dashboard-capabilities';

export default async function AuthorMemoryV3Page() {
  const { user, isAuthenticated } = await getAuthOrReview();

  if (
    isAuthenticated &&
    user &&
    typeof user.id === 'string' &&
    !isAuthorUiAccessAllowed({ id: user.id, email: user.email ?? undefined })
  ) {
    redirect('/dashboard');
  }

  const userName = (typeof user?.name === 'string' && user.name) || 'Author';
  const userPlanLabel = 'Indie · Author';

  return (
    <WorkspaceShell
      userName={userName}
      userPlanLabel={userPlanLabel}
      capabilities={getDashboardCapabilities(user)}
    />
  );
}
