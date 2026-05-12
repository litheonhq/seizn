// Legacy alias for Track 3 waitlist. Storage still uses desktop_waitlist, but
// public product naming is Seizn Program.
import { type NextRequest } from 'next/server';
import { POST as postProgramWaitlist } from '../program/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return postProgramWaitlist(request);
}
