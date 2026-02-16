import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import {
  canUseEncryptedMemories,
  getEncryptedMemoryPlanError,
} from '@/lib/memory/entitlements';

type E2EProfileRow = {
  e2e_salt: string | null;
  e2e_verification_block: string | null;
  e2e_setup_at: string | null;
};

type E2EPlanRow = {
  plan: string | null;
  e2e_salt: string | null;
  e2e_verification_block: string | null;
};

// GET /api/profile/e2e - Check whether the user has set up E2E PIN and fetch params (salt + verification block)
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('e2e_salt, e2e_verification_block, e2e_setup_at')
    .eq('id', userId)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }

  const row = (data || null) as E2EProfileRow | null;
  const hasSetup = Boolean(row?.e2e_salt && row?.e2e_verification_block);

  return NextResponse.json({
    success: true,
    data: {
      hasSetup,
      e2e_salt: row?.e2e_salt ?? null,
      e2e_verification_block: row?.e2e_verification_block ?? null,
      e2e_setup_at: row?.e2e_setup_at ?? null,
    },
  });
}

// PUT /api/profile/e2e - Save E2E setup material (salt + verification block)
// NOTE: Rotation is allowed but will make previously encrypted memories unrecoverable unless they are re-encrypted.
export async function PUT(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rec = body as Record<string, unknown>;
  const e2e_salt = typeof rec.e2e_salt === 'string' ? rec.e2e_salt : null;
  const e2e_verification_block =
    typeof rec.e2e_verification_block === 'string' ? rec.e2e_verification_block : null;
  const rotate = rec.rotate === true;

  if (!e2e_salt || !e2e_verification_block) {
    return NextResponse.json(
      { error: 'Missing required fields: e2e_salt, e2e_verification_block' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Guard against accidental rotation and enforce plan gate.
  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('plan, e2e_salt, e2e_verification_block')
    .eq('id', userId)
    .single();

  if (existingError) {
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }

  const existingRow = (existing || null) as E2EPlanRow | null;
  const plan = existingRow?.plan || 'free';
  const hasExisting = Boolean(existingRow?.e2e_salt && existingRow?.e2e_verification_block);

  if (!canUseEncryptedMemories(plan)) {
    return NextResponse.json(getEncryptedMemoryPlanError(), { status: 403 });
  }

  if (hasExisting && !rotate) {
    return NextResponse.json(
      {
        error: 'E2E is already set up. To rotate, re-send with { rotate: true }.',
      },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      e2e_salt,
      e2e_verification_block,
      e2e_setup_at: nowIso,
    })
    .eq('id', userId);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: {
      rotated: hasExisting && rotate,
      e2e_setup_at: nowIso,
    },
  });
}
