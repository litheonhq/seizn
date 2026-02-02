/**
 * Data Residency API
 *
 * Manage data residency policies and region configuration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createResidencyService } from '@/lib/residency/service';
import { REGION_DEFINITIONS, SKU_DEFINITIONS, getAvailableRegions } from '@/lib/residency/types';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const residencyService = createResidencyService(supabase);

    // Get current policy
    const policy = await residencyService.getPolicy(membership.organization_id);

    // Get available regions
    const availableRegions = await residencyService.getAvailableRegionsForOrg(
      membership.organization_id
    );

    // Get compliance summary
    const compliance = await residencyService.getComplianceSummary(
      membership.organization_id
    );

    // Get endpoints
    const endpoints = await residencyService.getEndpoints(membership.organization_id);

    return NextResponse.json({
      policy,
      availableRegions: availableRegions.map((code) => REGION_DEFINITIONS[code]),
      compliance,
      endpoints,
      allRegions: Object.values(REGION_DEFINITIONS),
    });
  } catch (error) {
    console.error('Data residency API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization and check admin role
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const residencyService = createResidencyService(supabase);

    // Validate available regions for SKU
    const availableRegions = await residencyService.getAvailableRegionsForOrg(
      membership.organization_id
    );

    if (body.primaryRegion && !availableRegions.includes(body.primaryRegion)) {
      return NextResponse.json(
        {
          error: 'Region not available',
          availableRegions,
        },
        { status: 400 }
      );
    }

    // Update policy
    const policy = await residencyService.setPolicy(membership.organization_id, {
      primaryRegion: body.primaryRegion,
      allowedRegions: body.allowedRegions,
      replicationPolicy: body.replicationPolicy,
      complianceRequirements: body.complianceRequirements,
      dataCategories: body.dataCategories,
    });

    return NextResponse.json({
      policy,
      message: 'Data residency policy updated',
    });
  } catch (error) {
    console.error('Data residency update error:', error);

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
