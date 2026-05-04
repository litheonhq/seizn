import { NextRequest, NextResponse } from 'next/server';
import {
  readJsonBody,
  withAuthorUiService,
} from '@/lib/author/ui';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return withAuthorUiService(request, async () => {
    const body = await readJsonBody(request);
    return {
      accepted: true,
      event: typeof body.event === 'string' ? body.event : 'unknown',
    };
  });
}

export async function GET() {
  return NextResponse.json({ accepted: false, error: 'POST required' }, { status: 405 });
}
