import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { CURRENT_LEGAL_VERSION_STAMP, CHECKOUT_LEGAL_VERSIONS } from '@/lib/checkout-copy';
import { logServerError } from '@/lib/server/logger';

/**
 * Founding-member re-consent endpoint (plan W5.9 + W3.2).
 *
 * Records the user's acceptance of the latest ToS + Privacy version stamp.
 * Pairs with `/dashboard/legal/reconsent` which renders the diff and the
 * primary CTA that POSTs here.
 *
 * Acceptance writes to `profiles.legal_version_accepted` + `legal_accepted_at`
 * (columns added in migration 20260509001). Read-only mode (when stale) is
 * enforced by middleware on /api/canon/* + /api/memory/* via stamp comparison.
 */

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { acceptedVersion?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // Strict version check — client MUST send back the exact stamp it was shown.
  // This prevents a stale tab from accepting old terms.
  if (body.acceptedVersion !== CURRENT_LEGAL_VERSION_STAMP) {
    return NextResponse.json(
      {
        error: 'version_mismatch',
        expected: CURRENT_LEGAL_VERSION_STAMP,
        got: body.acceptedVersion,
      },
      { status: 409 }
    );
  }

  const supabase = createServerClient();
  const { error } = await supabase
    .from('profiles')
    .update({
      legal_version_accepted: CURRENT_LEGAL_VERSION_STAMP,
      legal_accepted_at: new Date().toISOString(),
    })
    .eq('id', session.user.id);

  if (error) {
    logServerError('reconsent_update_failed', error);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    versions: CHECKOUT_LEGAL_VERSIONS,
    acceptedAt: new Date().toISOString(),
  });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data } = await supabase
    .from('profiles')
    .select('legal_version_accepted, legal_accepted_at')
    .eq('id', session.user.id)
    .maybeSingle();

  const accepted = data?.legal_version_accepted ?? null;
  return NextResponse.json({
    current: CURRENT_LEGAL_VERSION_STAMP,
    accepted,
    upToDate: accepted === CURRENT_LEGAL_VERSION_STAMP,
    acceptedAt: data?.legal_accepted_at ?? null,
  });
}
