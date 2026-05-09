import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkIpRateLimitAsync, getRateLimitHeaders } from '@/lib/rate-limit';

const SUCCESS_BODY = {
  message: 'Thanks. If this address is eligible, it has been added to the waitlist.',
  success: true,
};

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rateLimitResult = await checkIpRateLimitAsync(ip);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: getRateLimitHeaders(rateLimitResult) }
      );
    }

    const { email } = await request.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    const { error } = await supabase.from('waitlist').insert({
      email: email.toLowerCase(),
      source: 'website',
      referrer: request.headers.get('referer') || null,
    });

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return NextResponse.json(SUCCESS_BODY, { status: 200 });
      }

      console.error('Waitlist insert error:', error);
      return NextResponse.json(
        { error: 'Failed to join waitlist' },
        { status: 500 }
      );
    }

    return NextResponse.json(SUCCESS_BODY, { status: 200 });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
