import type { User } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createRequestAuthClient, hasServerSupabasePublicConfig } from '@/lib/supabase';

export type RequestUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  lastSignInAt?: string | null;
};

/**
 * Resolve the current user from either:
 * 1) Auth.js (NextAuth) session cookie (dashboard usage)
 * 2) Supabase JWT in Authorization: Bearer (API usage)
 */
export async function getRequestUser(request: NextRequest): Promise<RequestUser | null> {
  try {
    const session = await auth();
    if (session?.user?.id) {
      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        lastSignInAt: null,
      };
    }
  } catch {
    // Ignore and fall back to bearer token auth.
  }

  const user = await getSupabaseUserFromBearer(request);
  if (!user) return null;

  const name =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.user_metadata as any)?.full_name ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.user_metadata as any)?.name ||
    null;

  return {
    id: user.id,
    email: user.email,
    name,
    lastSignInAt: user.last_sign_in_at,
  };
}

export async function getSupabaseUserFromBearer(request: NextRequest): Promise<User | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  if (!hasServerSupabasePublicConfig()) return null;

  try {
    const token = authHeader.substring(7);
    const supabase = createRequestAuthClient(token);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) return null;
    return user ?? null;
  } catch {
    return null;
  }
}
