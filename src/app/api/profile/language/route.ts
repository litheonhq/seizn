import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { locales, type Locale } from '@/i18n/config';
import { logServerError } from '@/lib/server/logger';

// PATCH /api/profile/language - Update user's language preference
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { language } = body;

    // Validate language
    if (!language || !locales.includes(language as Locale)) {
      return NextResponse.json(
        { error: `Invalid language. Supported: ${locales.join(', ')}` },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Update profile
    const { error } = await supabase
      .from('profiles')
      .update({ language })
      .eq('id', session.user.id);

    if (error) {
      logServerError('Language update error', error, { userId: session.user.id });
      return NextResponse.json(
        { error: 'Failed to update language' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      language,
    });
  } catch (error) {
    logServerError('Language update route error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/profile/language - Get user's language preference
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('language')
      .eq('id', session.user.id)
      .single();

    return NextResponse.json({
      success: true,
      language: profile?.language || 'en',
    });
  } catch (error) {
    logServerError('Language fetch error', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
