import { NextResponse } from 'next/server';
import { checkProductionEnv, REQUIRED_PRODUCTION_ENV_VARS } from '@/lib/env-guard';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NODE_ENV !== 'production') {
    return NextResponse.json({ ok: true, mode: 'non-production' });
  }

  const result = checkProductionEnv();
  const missingDetails = result.missing.map((name) => {
    const spec = REQUIRED_PRODUCTION_ENV_VARS.find((variable) => variable.name === name);
    return { name, description: spec?.description };
  });

  return NextResponse.json(
    {
      ok: result.ok,
      missing: missingDetails,
      presentCount: result.present.length,
      requiredCount: REQUIRED_PRODUCTION_ENV_VARS.length,
    },
    { status: result.ok ? 200 : 503 }
  );
}
