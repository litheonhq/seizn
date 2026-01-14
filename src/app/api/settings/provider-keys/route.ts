import { NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { auth } from "@/lib/auth";
import {
  createRequestContext,
  successResponse,
  errorResponse,
} from "@/lib/errors";
import {
  encryptApiKey,
  decryptApiKey,
  generateKeyHint,
  validateKeyFormat,
  maskApiKey,
} from "@/lib/byok/encryption";

const VALID_PROVIDERS = ["openai", "anthropic", "cohere", "voyage", "google", "azure"];

/**
 * GET /api/settings/provider-keys
 * List all provider keys for the current user (keys are masked)
 */
export async function GET() {
  const context = createRequestContext();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("provider_keys")
      .select("id, provider, key_hint, is_active, is_default, label, last_used_at, usage_count, total_cost_usd, created_at")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch provider keys:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to fetch keys", status: 500 },
        context
      );
    }

    return successResponse({ keys: data || [] }, context);
  } catch (error) {
    console.error("Provider keys API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * POST /api/settings/provider-keys
 * Add a new provider key
 */
export async function POST(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const body = await request.json();
    const { provider, apiKey, label, isDefault } = body;

    // Validate provider
    if (!provider || !VALID_PROVIDERS.includes(provider)) {
      return errorResponse(
        { code: "SEIZN_209", message: `Provider must be one of: ${VALID_PROVIDERS.join(", ")}`, status: 400 },
        context
      );
    }

    // Validate API key
    if (!apiKey || typeof apiKey !== "string" || apiKey.length < 16) {
      return errorResponse(
        { code: "SEIZN_200", message: "API key is required and must be at least 16 characters", status: 400 },
        context
      );
    }

    // Validate key format
    if (!validateKeyFormat(provider, apiKey)) {
      return errorResponse(
        { code: "SEIZN_201", message: `Invalid ${provider} API key format`, status: 400 },
        context
      );
    }

    const supabase = createServerClient();

    // Encrypt the key
    const keyEncrypted = encryptApiKey(apiKey);
    const keyHint = generateKeyHint(apiKey);

    // If setting as default, unset other defaults for this provider
    if (isDefault) {
      await supabase
        .from("provider_keys")
        .update({ is_default: false })
        .eq("user_id", session.user.id)
        .eq("provider", provider);
    }

    // Insert the new key
    const { data, error } = await supabase
      .from("provider_keys")
      .insert({
        user_id: session.user.id,
        provider,
        key_encrypted: keyEncrypted,
        key_hint: keyHint,
        label: label || `${provider} key`,
        is_default: isDefault || false,
      })
      .select("id, provider, key_hint, label, is_default, created_at")
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse(
          { code: "SEIZN_301", message: "A key with this label already exists for this provider", status: 409 },
          context
        );
      }
      console.error("Failed to create provider key:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to save key", status: 500 },
        context
      );
    }

    // Log audit event
    await supabase.from("provider_keys_audit").insert({
      provider_key_id: data.id,
      user_id: session.user.id,
      action: "created",
      metadata: { provider, label: data.label },
    });

    return successResponse(
      { key: data, message: "Provider key added successfully" },
      context
    );
  } catch (error) {
    console.error("Provider keys API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}

/**
 * DELETE /api/settings/provider-keys
 * Delete a provider key
 */
export async function DELETE(request: NextRequest) {
  const context = createRequestContext(request);

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return errorResponse(
        { code: "SEIZN_104", message: "Authentication required", status: 401 },
        context
      );
    }

    const { searchParams } = new URL(request.url);
    const keyId = searchParams.get("id");

    if (!keyId) {
      return errorResponse(
        { code: "SEIZN_200", message: "Key ID is required", status: 400 },
        context
      );
    }

    const supabase = createServerClient();

    // Verify ownership
    const { data: existing } = await supabase
      .from("provider_keys")
      .select("id, provider")
      .eq("id", keyId)
      .eq("user_id", session.user.id)
      .single();

    if (!existing) {
      return errorResponse(
        { code: "SEIZN_300", message: "Key not found", status: 404 },
        context
      );
    }

    // Delete the key
    const { error } = await supabase
      .from("provider_keys")
      .delete()
      .eq("id", keyId)
      .eq("user_id", session.user.id);

    if (error) {
      console.error("Failed to delete provider key:", error);
      return errorResponse(
        { code: "SEIZN_405", message: "Failed to delete key", status: 500 },
        context
      );
    }

    // Log audit event
    await supabase.from("provider_keys_audit").insert({
      provider_key_id: keyId,
      user_id: session.user.id,
      action: "deleted",
      metadata: { provider: existing.provider },
    });

    return successResponse({ message: "Key deleted successfully" }, context);
  } catch (error) {
    console.error("Provider keys API error:", error);
    return errorResponse(
      { code: "SEIZN_500", message: "Internal server error", status: 500 },
      context
    );
  }
}
