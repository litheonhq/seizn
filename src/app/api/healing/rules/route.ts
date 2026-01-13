import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import {
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
  getRule,
  listRules,
  validateRuleRequest,
  RuleRequest,
} from '@/lib/self-healing';

/**
 * GET /api/healing/rules - List healing rules
 *
 * Query params:
 * - collectionId: UUID (optional)
 * - isActive: boolean (optional)
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const collectionId = searchParams.get('collectionId') ?? undefined;
    const isActiveParam = searchParams.get('isActive');
    const limit = parseInt(searchParams.get('limit') ?? '50');
    const offset = parseInt(searchParams.get('offset') ?? '0');

    let isActive: boolean | undefined;
    if (isActiveParam !== null) {
      isActive = isActiveParam === 'true';
    }

    const { rules, total } = await listRules(userId, {
      collectionId,
      isActive,
      limit,
      offset,
    });

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/rules', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      rules,
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Healing rules GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/healing/rules - Create a new healing rule
 *
 * Body: RuleRequest
 * - name: string (required)
 * - collectionId: UUID (optional) - null for all collections
 * - description: string (optional)
 * - triggerCondition: string (required) - e.g., 'health_score < 0.8'
 * - conditions: RuleCondition[] (optional)
 * - action: HealingActionType (required)
 * - actionParams: object (optional)
 * - autoExecute: boolean (optional)
 * - scheduleCron: string (optional) - Cron expression
 * - maxChunksPerRun: number (optional, default: 1000)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const ruleRequest: RuleRequest = {
      name: body.name,
      collectionId: body.collectionId,
      description: body.description,
      triggerCondition: body.triggerCondition,
      conditions: body.conditions,
      action: body.action,
      actionParams: body.actionParams,
      autoExecute: body.autoExecute,
      scheduleCron: body.scheduleCron,
      maxChunksPerRun: body.maxChunksPerRun,
    };

    // Validate request
    const validation = validateRuleRequest(ruleRequest);
    if (!validation.valid) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/rules', method: 'POST', startTime },
        400
      );
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const rule = await createRule(userId, ruleRequest);

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/rules', method: 'POST', startTime },
      201
    );

    return NextResponse.json(
      {
        success: true,
        rule,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Healing rules POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/healing/rules - Update a rule
 *
 * Body:
 * - ruleId: UUID (required)
 * - ... RuleRequest fields to update
 */
export async function PATCH(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const ruleId = body.ruleId;

    if (!ruleId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/rules', method: 'PATCH', startTime },
        400
      );
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      );
    }

    // Check if this is just a toggle operation
    if (body.toggle !== undefined) {
      const rule = await toggleRule(ruleId, userId, body.toggle);

      await logRequest(
        { userId, keyId, endpoint: '/api/healing/rules', method: 'PATCH', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        rule,
      });
    }

    // Otherwise, full update
    const updates: Partial<RuleRequest> = {};

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.triggerCondition !== undefined) updates.triggerCondition = body.triggerCondition;
    if (body.conditions !== undefined) updates.conditions = body.conditions;
    if (body.action !== undefined) updates.action = body.action;
    if (body.actionParams !== undefined) updates.actionParams = body.actionParams;
    if (body.autoExecute !== undefined) updates.autoExecute = body.autoExecute;
    if (body.scheduleCron !== undefined) updates.scheduleCron = body.scheduleCron;
    if (body.maxChunksPerRun !== undefined) updates.maxChunksPerRun = body.maxChunksPerRun;

    const rule = await updateRule(ruleId, userId, updates);

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/rules', method: 'PATCH', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      rule,
    });
  } catch (err) {
    console.error('Healing rules PATCH error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/healing/rules - Delete a rule
 *
 * Query params:
 * - ruleId: UUID of the rule to delete
 */
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const ruleId = searchParams.get('ruleId');

    if (!ruleId) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/rules', method: 'DELETE', startTime },
        400
      );
      return NextResponse.json(
        { error: 'ruleId is required' },
        { status: 400 }
      );
    }

    // Verify rule exists and belongs to user
    const rule = await getRule(ruleId, userId);
    if (!rule) {
      await logRequest(
        { userId, keyId, endpoint: '/api/healing/rules', method: 'DELETE', startTime },
        404
      );
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    await deleteRule(ruleId, userId);

    await logRequest(
      { userId, keyId, endpoint: '/api/healing/rules', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      message: 'Rule deleted',
    });
  } catch (err) {
    console.error('Healing rules DELETE error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
