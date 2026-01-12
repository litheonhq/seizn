/**
 * Demo Session Utilities
 *
 * Helper functions for managing anonymous sandbox sessions.
 */

import { createClient } from "@supabase/supabase-js";

// Demo session configuration
export const DEMO_CONFIG = {
  ttlMs: 15 * 60 * 1000, // 15 minutes
  maxCalls: 10,
  maxTokens: 10000,
};

/**
 * Generate a random demo token
 */
export function generateDemoToken(): string {
  return `demo_${generateRandomId(32)}`;
}

/**
 * Validate a demo session token.
 */
export async function validateDemoSession(
  token: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!token.startsWith("demo_")) {
    return { valid: false, reason: "Invalid token format" };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Allow demo in development without DB
    return { valid: true };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from("demo_sessions")
    .select("*")
    .eq("token_hash", hashToken(token))
    .single();

  if (error || !data) {
    return { valid: false, reason: "Session not found" };
  }

  if (new Date(data.expires_at) < new Date()) {
    return { valid: false, reason: "Session expired" };
  }

  if (data.calls_used >= data.max_calls) {
    return { valid: false, reason: "Call limit exceeded" };
  }

  if (data.tokens_used >= data.max_tokens) {
    return { valid: false, reason: "Token limit exceeded" };
  }

  return { valid: true };
}

/**
 * Increment usage for a demo session.
 */
export async function incrementDemoUsage(
  token: string,
  tokensUsed: number
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) return;

  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase.rpc("increment_demo_usage", {
    p_token_hash: hashToken(token),
    p_tokens: tokensUsed,
  });
}

// Helper functions
function generateRandomId(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

export function hashToken(token: string): string {
  // Simple hash for demo purposes
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, "0");
}
