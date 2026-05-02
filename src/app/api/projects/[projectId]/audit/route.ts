import { NextRequest } from 'next/server';
import {
  type AuthorUiRouteParams,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: AuthorUiRouteParams<{ projectId: string }>
) {
  const { projectId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const replayDecisionId = searchParams.get('replay_decision_id')
    ?? (searchParams.get('replay') === '1' ? searchParams.get('decision_id') : null);

  return withAuthorUiService(request, (service) =>
    replayDecisionId
      ? service.replayAuditDecision(projectId, replayDecisionId)
      : service.listAuditLogs(projectId, searchParams)
  );
}
