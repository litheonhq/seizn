import { createClient, SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// Client-side Supabase client (uses anon key)
export function createBrowserClient(): AnySupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Server-side Supabase client (uses service role key)
export function createServerClient(): AnySupabaseClient {
  // Prefer server-only SUPABASE_URL when available to avoid accidental
  // cross-project contamination from globally exported NEXT_PUBLIC_* vars.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Singleton for browser client
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabase() {
  if (typeof window === 'undefined') {
    // Server-side: always create new client
    return createServerClient();
  }

  // Client-side: use singleton
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
}
