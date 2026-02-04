/**
 * Auto-Eval Configuration API
 *
 * GET /api/eval/config - Get organization eval config
 * POST /api/eval/config - Create or update eval config
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { autoEvalService } from '@/lib/eval/auto-eval-service';
import type { AutoEvalConfigInput } from '@/lib/eval/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const organizationId = searchParams.get('organizationId');
    const packId = searchParams.get('packId') ?? undefined;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing required parameter: organizationId' },
        { status: 400 }
      );
    }

    // Verify user has access to the organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      );
    }

    // Get or create config
    const config = await autoEvalService.getOrCreateConfig(organizationId, packId);

    return NextResponse.json(config);
  } catch (error) {
    console.error('[API] Eval config GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Verify authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, ...updates } = body as AutoEvalConfigInput & {
      organizationId: string;
    };

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing required field: organizationId' },
        { status: 400 }
      );
    }

    // Verify user is admin of the organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'Access denied to organization' },
        { status: 403 }
      );
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only admins can update eval configuration' },
        { status: 403 }
      );
    }

    // Get or create config, then update
    const existingConfig = await autoEvalService.getOrCreateConfig(
      organizationId,
      updates.packId
    );

    const updatedConfig = await autoEvalService.updateConfig(existingConfig.id, {
      evalOnPublish: updates.evalOnPublish ?? existingConfig.evalOnPublish,
      evalOnInstall: updates.evalOnInstall ?? existingConfig.evalOnInstall,
      evalOnUpdate: updates.evalOnUpdate ?? existingConfig.evalOnUpdate,
      evalOnActivation: updates.evalOnActivation ?? existingConfig.evalOnActivation,
      runSecurityTests: updates.runSecurityTests ?? existingConfig.runSecurityTests,
      runRegressionTests: updates.runRegressionTests ?? existingConfig.runRegressionTests,
      runComplianceTests: updates.runComplianceTests ?? existingConfig.runComplianceTests,
      runPerformanceTests: updates.runPerformanceTests ?? existingConfig.runPerformanceTests,
      blockOnCritical: updates.blockOnCritical ?? existingConfig.blockOnCritical,
      blockOnHigh: updates.blockOnHigh ?? existingConfig.blockOnHigh,
      regressionThreshold: updates.regressionThreshold ?? existingConfig.regressionThreshold,
      slackWebhookUrl: updates.slackWebhookUrl ?? existingConfig.slackWebhookUrl,
      emailRecipients: updates.emailRecipients ?? existingConfig.emailRecipients,
      notifyOnSuccess: updates.notifyOnSuccess ?? existingConfig.notifyOnSuccess,
      notifyOnFailure: updates.notifyOnFailure ?? existingConfig.notifyOnFailure,
    });

    return NextResponse.json(updatedConfig);
  } catch (error) {
    console.error('[API] Eval config POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
