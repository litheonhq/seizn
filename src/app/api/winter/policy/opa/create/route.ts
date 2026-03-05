/**
 * Winter OPA Policy Creation API
 *
 * POST /api/winter/policy/opa/create - Create a new Rego policy
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  createRegoPolicy,
  testPolicy,
  getTemplateById,
  applyTemplateVariables,
  getOpaPolicyEngine,
  type RegoPolicyCategory,
  type RegoPolicyScope,
} from '@/lib/winter/opa';

// ============================================
// Auth Helper
// ============================================


// ============================================
// POST /api/winter/policy/opa/create
// Create a new Rego policy
// ============================================

export async function POST(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      organizationId,
      name,
      description,
      category,
      regoCode,
      priority,
      scope,
      // Template-based creation
      templateId,
      templateVariables,
      // Test before save
      testCases,
      validateOnly,
    } = body as {
      organizationId: string;
      name: string;
      description?: string;
      category: RegoPolicyCategory;
      regoCode?: string;
      priority?: number;
      scope?: RegoPolicyScope;
      templateId?: string;
      templateVariables?: Record<string, unknown>;
      testCases?: Array<{
        name: string;
        input: Record<string, unknown>;
        expectedAllow: boolean;
      }>;
      validateOnly?: boolean;
    };

    // Validation
    if (!organizationId) {
      return NextResponse.json(
        { error: 'organizationId is required' },
        { status: 400 }
      );
    }

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    if (!category) {
      return NextResponse.json(
        { error: 'category is required' },
        { status: 400 }
      );
    }

    // Get Rego code (from template or direct)
    let finalRegoCode = regoCode;

    if (templateId) {
      const template = getTemplateById(templateId);
      if (!template) {
        return NextResponse.json(
          { error: `Template not found: ${templateId}` },
          { status: 400 }
        );
      }

      finalRegoCode = templateVariables
        ? applyTemplateVariables(template, templateVariables)
        : template.regoCode;
    }

    if (!finalRegoCode) {
      return NextResponse.json(
        { error: 'regoCode or templateId is required' },
        { status: 400 }
      );
    }

    // Validate the policy
    const engine = getOpaPolicyEngine();
    const validation = engine.validatePolicy(finalRegoCode);

    if (!validation.valid) {
      return NextResponse.json(
        {
          error: 'Invalid policy syntax',
          validation,
        },
        { status: 400 }
      );
    }

    // Run tests if provided
    let testResults = null;
    if (testCases && testCases.length > 0) {
      testResults = await testPolicy(finalRegoCode, testCases);

      // Fail if tests don't pass (optional)
      if (testResults.failed > 0) {
        return NextResponse.json({
          success: false,
          error: `${testResults.failed} test(s) failed`,
          validation,
          testResults,
        });
      }
    }

    // If validate only, return without saving
    if (validateOnly) {
      return NextResponse.json({
        success: true,
        validation,
        ...(testResults && { testResults }),
        message: 'Policy is valid',
      });
    }

    // Create the policy
    const policy = await createRegoPolicy({
      organizationId,
      name,
      description,
      category,
      regoCode: finalRegoCode,
      priority,
      scope,
      createdBy: user.id,
    });

    return NextResponse.json({
      success: true,
      policy,
      validation,
      ...(testResults && { testResults }),
    });
  } catch (error) {
    console.error('[Winter OPA Create] POST error:', error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
