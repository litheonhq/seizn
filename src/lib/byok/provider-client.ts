import { createServerClient } from "@/lib/supabase";
import { decryptApiKey } from "./encryption";

export type Provider = "openai" | "anthropic" | "cohere" | "voyage" | "google" | "azure";

export interface ProviderKey {
  id: string;
  provider: Provider;
  apiKey: string; // Decrypted
  isDefault: boolean;
}

/**
 * Get the user's provider key for a specific provider
 * @param userId User ID
 * @param provider Provider name
 * @returns Decrypted API key or null if not found
 */
export async function getUserProviderKey(
  userId: string,
  provider: Provider
): Promise<ProviderKey | null> {
  const supabase = createServerClient();

  // First try to get the default key for this provider
  const { data: defaultKey } = await supabase
    .from("provider_keys")
    .select("id, provider, key_encrypted, is_default")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("is_active", true)
    .eq("is_default", true)
    .single();

  if (defaultKey) {
    return {
      id: defaultKey.id,
      provider: defaultKey.provider as Provider,
      apiKey: decryptApiKey(defaultKey.key_encrypted),
      isDefault: true,
    };
  }

  // Fallback to any active key for this provider
  const { data: anyKey } = await supabase
    .from("provider_keys")
    .select("id, provider, key_encrypted, is_default")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (anyKey) {
    return {
      id: anyKey.id,
      provider: anyKey.provider as Provider,
      apiKey: decryptApiKey(anyKey.key_encrypted),
      isDefault: anyKey.is_default,
    };
  }

  return null;
}

/**
 * Get all active provider keys for a user
 */
export async function getAllUserProviderKeys(
  userId: string
): Promise<Record<Provider, ProviderKey | null>> {
  const providers: Provider[] = ["openai", "anthropic", "cohere", "voyage", "google", "azure"];
  const result: Record<string, ProviderKey | null> = {};

  for (const provider of providers) {
    result[provider] = await getUserProviderKey(userId, provider);
  }

  return result as Record<Provider, ProviderKey | null>;
}

/**
 * Record usage of a provider key
 */
export async function recordKeyUsage(
  keyId: string,
  costUsd: number = 0
): Promise<void> {
  const supabase = createServerClient();

  await supabase.rpc("update_provider_key_usage", {
    p_key_id: keyId,
    p_cost_usd: costUsd,
  });
}

/**
 * Get effective API key for a provider
 * Falls back to environment variable if user doesn't have BYOK
 */
export async function getEffectiveApiKey(
  userId: string | null,
  provider: Provider
): Promise<{ apiKey: string; source: "byok" | "managed"; keyId?: string } | null> {
  // Try BYOK first if user is authenticated
  if (userId) {
    const userKey = await getUserProviderKey(userId, provider);
    if (userKey) {
      return {
        apiKey: userKey.apiKey,
        source: "byok",
        keyId: userKey.id,
      };
    }
  }

  // Fallback to managed (environment) keys
  const envKeyMap: Record<Provider, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    cohere: process.env.COHERE_API_KEY,
    voyage: process.env.VOYAGE_API_KEY,
    google: process.env.GOOGLE_AI_API_KEY,
    azure: process.env.AZURE_OPENAI_API_KEY,
  };

  const envKey = envKeyMap[provider];
  if (envKey) {
    return {
      apiKey: envKey,
      source: "managed",
    };
  }

  return null;
}
