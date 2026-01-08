import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { generateApiKey } from '@/lib/api-key';

// POST /api/auth/signup - Create a new user account
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: name,
      },
    });

    if (authError) {
      console.error('Signup error:', authError);

      if (authError.message.includes('already registered')) {
        return NextResponse.json(
          { error: 'An account with this email already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create account' },
        { status: 500 }
      );
    }

    // Profile will be created automatically by the Supabase trigger
    // But since we changed to NextAuth, let's also create/upsert profile here
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email: authData.user.email,
      full_name: name,
      plan: 'free',
    });

    // Generate instant API key (mem0-style UX)
    const { key, hash, prefix } = generateApiKey();

    await supabase.from('api_keys').insert({
      user_id: authData.user.id,
      name: 'Default Key',
      key_hash: hash,
      key_prefix: prefix,
      scopes: ['memory:read', 'memory:write'],
      is_active: true,
    });

    return NextResponse.json({
      success: true,
      message: 'Account created successfully',
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
      apiKey: key,
      apiKeyMessage: 'Save this API key securely. It will not be shown again.',
    });
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
