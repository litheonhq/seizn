/**
 * Server-side Supabase client
 * Re-exports from main supabase module for path compatibility
 */

import { createServerClient as createServerClientBase } from '../supabase';

// Re-export with expected name
export const createClient = createServerClientBase;
export { createServerClient } from '../supabase';
