import { NextRequest, NextResponse } from 'next/server';
import { ensureCsrfCookie } from '@/lib/csrf';

export function GET(request: NextRequest) {
  return ensureCsrfCookie(request, NextResponse.json({ ok: true }));
}
