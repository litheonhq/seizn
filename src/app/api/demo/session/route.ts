/**
 * Demo Session API
 *
 * Creates anonymous sandbox sessions for homepage demo.
 * Sessions are short-lived (15 min) with strict quotas.
 *
 * POST /api/demo/session - Create new demo session
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEMO_CONFIG, generateDemoToken, hashToken } from "@/lib/demo/session";

export async function POST(request: NextRequest) {
  try {
    // Get client IP for binding
    const forwardedFor = request.headers.get("x-forwarded-for");
    const clientIp = forwardedFor?.split(",")[0]?.trim() || "unknown";

    // Generate demo token
    const demoToken = generateDemoToken();
    const expiresAt = new Date(Date.now() + DEMO_CONFIG.ttlMs);

    // Store session in Supabase (if configured)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from("demo_sessions").insert({
        token_hash: hashToken(demoToken),
        client_ip: clientIp,
        expires_at: expiresAt.toISOString(),
        max_calls: DEMO_CONFIG.maxCalls,
        max_tokens: DEMO_CONFIG.maxTokens,
        calls_used: 0,
        tokens_used: 0,
      });
    }

    return NextResponse.json(
      {
        demo_token: demoToken,
        expires_at: expiresAt.toISOString(),
        limits: {
          max_calls: DEMO_CONFIG.maxCalls,
          max_tokens: DEMO_CONFIG.maxTokens,
          ttl_minutes: DEMO_CONFIG.ttlMs / 60000,
        },
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("[demo/session] Error:", error);
    return NextResponse.json(
      { error: "Failed to create demo session" },
      { status: 500 }
    );
  }
}
