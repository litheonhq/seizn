/**
 * Policy Packs Catalog API
 *
 * Search and browse the policy pack catalog.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createPolicyPackService } from '@/lib/policy-packs';
import type { PolicyCategory } from '@/lib/policy-packs';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query') || undefined;
    const category = searchParams.get('category') as PolicyCategory | null;
    const official = searchParams.get('official');
    const minRating = searchParams.get('minRating');
    const sortBy = searchParams.get('sortBy') as 'installs' | 'rating' | 'recent' | 'name' | null;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');

    const service = createPolicyPackService(supabase);
    const packs = await service.searchCatalog({
      query,
      category: category || undefined,
      official: official === 'true' ? true : official === 'false' ? false : undefined,
      minRating: minRating ? parseFloat(minRating) : undefined,
      sortBy: sortBy || undefined,
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
    });

    return NextResponse.json({ packs });
  } catch (error) {
    console.error('Search catalog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization as publisher
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id, organizations(name)')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: 'No organization found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const service = createPolicyPackService(supabase);

    const org = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
    const publisher = (org as { name: string })?.name || 'unknown';
    const pack = await service.createPack(body, publisher);

    return NextResponse.json({ pack }, { status: 201 });
  } catch (error) {
    console.error('Create pack error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
