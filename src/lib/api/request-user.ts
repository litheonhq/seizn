import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@/lib/auth';

export type RequestUser = {
  id: string;
  email?: string | null;
  name?: string | null;
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
      };
    }
  } catch {
    // Ignore and fall back to bearer token auth.
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
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
  };
}

