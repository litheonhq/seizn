import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authErrorResponse, isAuthError } from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import {
  deactivateCanonLock,
  parseCanonScope,
  parseCanonSeverity,
  updateCanonLock,
} from '@/lib/canon/enforce';
import { resolveMemoryBudgetOrganizationId } from '@/lib/memory/budget';
import { logServerError } from '@/lib/server/logger';
import { createServerClient } from '@/lib/supabase';

async function resolveContext(request: NextRequest): Promise<
  | { userId: string; keyId: string | null; organizationId: string }
  | { error: NextResponse }
> {
  const authResult = await authenticateRequest(request, { skipUsageCheck: true });
  let userId: string | null = null;
  let keyId: string | null = null;

  if (!isAuthError(authResult)) {
    userId = authResult.userId;
    keyId = authResult.keyId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: authErrorResponse(authResult.authError) };
    }
    userId = session.user.id;
  }

  const supabase = createServerClient();
  const organizationId = await resolveMemoryBudgetOrganizationId(supabase, { userId, keyId });
  if (!organizationId) {
    return {
      error: NextResponse.json(
        { success: false, error: { code: 'organization_required', message: 'No organization is available for canon locks' } },
        { status: 400 }
      ),
    };
  }

  return { userId, keyId, organizationId };
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildPatch(body: Record<string, unknown>) {
  const patch: Parameters<typeof updateCanonLock>[2] = {};

  if ('npcId' in body || 'npc_id' in body) {
    patch.npcId = normalizeOptionalString(body.npcId ?? body.npc_id);
  }
  if ('scope' in body) {
    const scope = parseCanonScope(body.scope);
    if (!scope) throw new Error('invalid_scope');
    patch.scope = scope;
  }
  if ('statement' in body) {
    const statement = normalizeOptionalString(body.statement);
    if (!statement) throw new Error('statement_required');
    patch.statement = statement;
  }
  if ('regexFastpath' in body || 'regex_fastpath' in body) {
    const regexFastpath = normalizeOptionalString(body.regexFastpath ?? body.regex_fastpath);
    if (regexFastpath) new RegExp(regexFastpath);
    patch.regexFastpath = regexFastpath;
  }
  if ('severity' in body) {
    const severity = parseCanonSeverity(body.severity);
    if (!severity) throw new Error('invalid_severity');
    patch.severity = severity;
  }
  if ('active' in body) {
    patch.active = body.active !== false;
  }

  return patch;
}

function validationError(error: unknown): NextResponse | null {
  const message = error instanceof Error ? error.message : '';
  if (message === 'invalid_scope') {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_scope', message: 'scope must be never_say, always_say, must_not_know, or must_know' } },
      { status: 400 }
    );
  }
  if (message === 'statement_required') {
    return NextResponse.json(
      { success: false, error: { code: 'statement_required', message: 'statement is required' } },
      { status: 400 }
    );
  }
  if (message === 'invalid_severity') {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_severity', message: 'severity must be hard or soft' } },
      { status: 400 }
    );
  }
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, error: { code: 'invalid_regex', message: 'regexFastpath must be a valid regular expression' } },
      { status: 400 }
    );
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveContext(request);
    if ('error' in context) return context.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    let patch: Parameters<typeof updateCanonLock>[2];
    try {
      patch = buildPatch(body);
    } catch (error) {
      const response = validationError(error);
      if (response) return response;
      throw error;
    }

    const { id } = await params;
    const lock = await updateCanonLock(context.organizationId, id, patch);
    return NextResponse.json({ success: true, data: { lock } });
  } catch (error) {
    logServerError('[api/canon/locks/:id] PATCH failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'canon_lock_update_failed', message: 'Failed to update canon lock' } },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await resolveContext(request);
    if ('error' in context) return context.error;

    const { id } = await params;
    const lock = await deactivateCanonLock(context.organizationId, id);
    return NextResponse.json({ success: true, data: { lock } });
  } catch (error) {
    logServerError('[api/canon/locks/:id] DELETE failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'canon_lock_deactivate_failed', message: 'Failed to deactivate canon lock' } },
      { status: 500 }
    );
  }
}
