import { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { rotateCsrfCookie } from '@/lib/csrf';

const { GET: nextAuthGET, POST: nextAuthPOST } = handlers;

function shouldRotateCsrf(request: Request, response: Response): boolean {
  if (response.status >= 400) return false;
  const { pathname } = new URL(request.url);
  return pathname.includes('/api/auth/callback/') || pathname.endsWith('/api/auth/signout');
}

export async function GET(request: NextRequest) {
  const response = await nextAuthGET(request);
  return shouldRotateCsrf(request, response) ? rotateCsrfCookie(response) : response;
}

export async function POST(request: NextRequest) {
  const response = await nextAuthPOST(request);
  return shouldRotateCsrf(request, response) ? rotateCsrfCookie(response) : response;
}
