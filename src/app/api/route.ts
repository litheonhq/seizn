import { NextResponse } from 'next/server';

/**
 * GET /api
 * Redirect to API documentation
 */
export function GET() {
  return NextResponse.redirect(
    new URL('/docs', process.env.NEXT_PUBLIC_APP_URL || 'https://seizn.com')
  );
}
