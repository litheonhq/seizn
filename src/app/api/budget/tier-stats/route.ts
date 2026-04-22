import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { resolveComplianceOrganizationId } from '@/lib/compliance/organization';
import { getTierStats } from '@/lib/memory/budget';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: { code: 'unauthorized', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const supabase = createServerClient();
    const organizationId =
      session.user.organizationId ||
      await resolveComplianceOrganizationId(supabase, { userId: session.user.id });
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: { code: 'organization_required', message: 'No organization is available for tier stats' } },
        { status: 403 }
      );
    }

    const stats = await getTierStats(organizationId, supabase);
    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    logServerError('[api/budget/tier-stats] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'tier_stats_failed', message: 'Failed to load tier stats' } },
      { status: 500 }
    );
  }
}
