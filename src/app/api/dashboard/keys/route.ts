import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';

// GET /api/dashboard/keys - List user's API keys (NextAuth session)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('List keys error:', error);
      return NextResponse.json(
        { error: 'Failed to list keys' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      keys: keys || [],
    });
  } catch (error) {
    console.error('List keys error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/dashboard/keys - Create a new API key (NextAuth session)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const name = body.name || 'Default Key';

    const supabase = createServerClient();

    // Check user's plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', session.user.id)
      .single();

    // Count existing keys
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const plan = profile?.plan || 'free';
    const keyLimits: Record<string, number> = {
      free: 2,
      plus: 5,
      pro: 10,
      enterprise: 100,
    };
    const keyLimit = keyLimits[plan] || 2;

    if ((count || 0) >= keyLimit) {
      return NextResponse.json(
        { error: `API key limit reached (${keyLimit} keys for ${plan} plan)` },
        { status: 403 }
      );
    }

    // Generate new API key
    const { key, hash, prefix } = generateApiKey();

    // Insert key record
    const { data: keyRecord, error: insertError } = await supabase
      .from('api_keys')
      .insert({
        user_id: session.user.id,
        name: name,
        key_hash: hash,
        key_prefix: prefix,
        scopes: ['memory:read', 'memory:write'],
        is_active: true,
      })
      .select('id, name, key_prefix, scopes, created_at')
      .single();

    if (insertError) {
      console.error('Create key error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      key: key,
      keyRecord: keyRecord,
      message: 'Save this key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Create key error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/dashboard/keys - Revoke an API key (NextAuth session)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'Key ID required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Revoke key error:', error);
      return NextResponse.json(
        { error: 'Failed to revoke key' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'API key revoked',
    });
  } catch (error) {
    console.error('Revoke key error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
