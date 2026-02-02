/**
 * Tool Tokens API
 *
 * List and create tool access tokens.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createToolGatingService } from '@/lib/tool-gating';

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

    // Only admins can list tokens
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const service = createToolGatingService(supabase);
    const tokens = await service.listTokens(membership.organization_id);

    // Remove sensitive fields
    const safeTokens = tokens.map(({ tokenHash, ...token }) => token);

    return NextResponse.json({ tokens: safeTokens });
  } catch (error) {
    console.error('List tokens error:', error);
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

    // Only admins can create tokens
    if (!['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const service = createToolGatingService(supabase);
    const tokenWithSecret = await service.createToken(
      membership.organization_id,
      body,
      user.id
    );

    // Return token value only once
    const { tokenHash, ...safeToken } = tokenWithSecret;

    return NextResponse.json(
      {
        token: safeToken,
        secret: tokenWithSecret.token,
        warning: 'Store this token securely. It will not be shown again.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create token error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
