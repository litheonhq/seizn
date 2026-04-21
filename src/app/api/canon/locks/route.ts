import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authErrorResponse, isAuthError } from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import {
  createCanonLock,
  listCanonLocks,
  listCanonViolations,
  parseCanonScope,
  parseCanonSeverity,
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

export async function GET(request: NextRequest) {
  try {
    const context = await resolveContext(request);
    if ('error' in context) return context.error;

    const supabase = createServerClient();
    const [locks, violations] = await Promise.all([
      listCanonLocks(context.organizationId, supabase),
      listCanonViolations(context.organizationId, supabase, { limit: 50 }),
    ]);

    return NextResponse.json({
      success: true,
      data: { locks, violations },
    });
  } catch (error) {
    logServerError('[api/canon/locks] GET failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'canon_locks_unavailable', message: 'Failed to list canon locks' } },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await resolveContext(request);
    if ('error' in context) return context.error;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const scope = parseCanonScope(body.scope);
    const severity = parseCanonSeverity(body.severity || 'hard');
    const statement = normalizeOptionalString(body.statement);
    const regexFastpath = normalizeOptionalString(body.regexFastpath ?? body.regex_fastpath);

    if (!scope) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_scope', message: 'scope must be never_say, always_say, must_not_know, or must_know' } },
        { status: 400 }
      );
    }
    if (!severity) {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_severity', message: 'severity must be hard or soft' } },
        { status: 400 }
      );
    }
    if (!statement) {
      return NextResponse.json(
        { success: false, error: { code: 'statement_required', message: 'statement is required' } },
        { status: 400 }
      );
    }
    if (regexFastpath) {
      try {
        new RegExp(regexFastpath);
      } catch {
        return NextResponse.json(
          { success: false, error: { code: 'invalid_regex', message: 'regexFastpath must be a valid regular expression' } },
          { status: 400 }
        );
      }
    }

    const lock = await createCanonLock(context.organizationId, {
      npcId: normalizeOptionalString(body.npcId ?? body.npc_id),
      scope,
      statement,
      regexFastpath,
      severity,
      active: body.active !== false,
      createdBy: context.userId,
    });

    return NextResponse.json({ success: true, data: { lock } }, { status: 201 });
  } catch (error) {
    logServerError('[api/canon/locks] POST failed', error);
    return NextResponse.json(
      { success: false, error: { code: 'canon_lock_create_failed', message: 'Failed to create canon lock' } },
      { status: 500 }
    );
  }
}
