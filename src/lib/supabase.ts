import { createClient, SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;
type CreateClientOptions = Parameters<typeof createClient>[2];

export function getServerSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
}

function getSupabasePublicKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

export function hasServerSupabasePublicConfig(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  );
}

export function getServerSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY!;
}

export function hasServerSupabaseServiceRoleConfig(): boolean {
  return Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// Client-side Supabase client (uses anon key)
export function createBrowserClient(): AnySupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = getSupabasePublicKey();

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Server-side Supabase client (uses service role key)
export function createServerClient(): AnySupabaseClient {
  // Prefer server-only SUPABASE_URL when available to avoid accidental
  // cross-project contamination from globally exported NEXT_PUBLIC_* vars.
  const supabaseUrl = getServerSupabaseUrl();
  const supabaseServiceKey = getServerSupabaseServiceRoleKey();

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

// Server-side anon/publishable client for validating request-scoped JWTs.
export function createServerAnonClient(options?: CreateClientOptions): AnySupabaseClient {
  return createClient(getServerSupabaseUrl(), getSupabasePublicKey(), options);
}

export function createRequestAuthClient(token: string): AnySupabaseClient {
  return createServerAnonClient({
    global: { headers: { Authorization: `Bearer ${token}` } },
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
