import { NextRequest } from 'next/server';
import {
  AuthorUiValidationError,
  readJsonBody,
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';
import { normalizeConflictResolution } from '@/lib/author/ui/conflict-resolution';

export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string; conflictId: string }>
) {
  const { projectId, conflictId } = await params;
  return withAuthorUiService(request, async (service) => {
    const resolution = normalizeConflictResolution(await readJsonBody(request));
    if (!resolution) {
      throw new AuthorUiValidationError('decision must be keep_existing, replace_with_new, defer_both, or custom');
    }
    return service.resolveConflict(projectId, conflictId, resolution as unknown as Record<string, unknown>);
  });
}
