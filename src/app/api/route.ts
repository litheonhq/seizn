import { NextResponse } from 'next/server';

/**
 * GET /api
 * Redirect to the public API + MCP documentation page (Track 2, EN-primary).
 * Was redirecting to /docs (Track 1 NPC SDK docs); after the 2026-05-06 Track 2
 * launch /api is the canonical landing for the REST + MCP surface.
 */
export function GET() {
  return NextResponse.redirect(
    new URL('/en/api', process.env.NEXT_PUBLIC_APP_URL || 'https://seizn.com'),
    307,
  );
}
