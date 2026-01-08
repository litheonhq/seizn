import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';
import { createClient } from '@supabase/supabase-js';

// Helper to get user from Authorization header (Bearer token)
async function getUserFromToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// GET /api/keys - List user's API keys
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createServerClient();

    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at')
      .eq('user_id', user.id)
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

// POST /api/keys - Create a new API key
export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
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
      .eq('id', user.id)
      .single() as { data: { plan: string } | null };

    // Count existing keys
    const { count } = await supabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true);

    const plan = profile?.plan || 'free';
    const keyLimit = plan === 'free' ? 2 : plan === 'pro' ? 10 : 100;

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
        user_id: user.id,
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

    // Return the full key only once (never stored/shown again)
    return NextResponse.json({
      success: true,
      key: key, // Full key - show only once!
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

// DELETE /api/keys - Revoke an API key
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUserFromToken(request);
    if (!user) {
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
      .eq('user_id', user.id);

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
