/**
 * BYOK Provider Factory
 *
 * Creates AI provider instances using user's BYOK keys when available,
 * falling back to managed (environment) keys otherwise.
 */

import { VoyageEmbeddingProvider } from "@/lib/summer/embedding/voyage";
import { CohereRerankProvider } from "@/lib/summer/rerank/cohere";
import { getEffectiveApiKey, recordKeyUsage, type Provider } from "./provider-client";

export interface ProviderConfig {
  userId: string | null;
}

export interface EmbeddingProviderResult {
  provider: VoyageEmbeddingProvider;
  source: "byok" | "managed";
  keyId?: string;
  recordUsage: (costUsd?: number) => Promise<void>;
}

export interface RerankProviderResult {
  provider: CohereRerankProvider;
  source: "byok" | "managed";
  keyId?: string;
  recordUsage: (costUsd?: number) => Promise<void>;
}

/**
 * Get Voyage embedding provider with BYOK support
 */
export async function getVoyageEmbeddingProvider(
  config: ProviderConfig
): Promise<EmbeddingProviderResult | null> {
  const keyResult = await getEffectiveApiKey(config.userId, "voyage");

  if (!keyResult) {
    return null;
  }

  const provider = new VoyageEmbeddingProvider({
    apiKey: keyResult.apiKey,
  });

  return {
    provider,
    source: keyResult.source,
    keyId: keyResult.keyId,
    recordUsage: async (costUsd?: number) => {
      if (keyResult.keyId) {
        await recordKeyUsage(keyResult.keyId, costUsd);
      }
    },
  };
}

/**
 * Get Cohere rerank provider with BYOK support
 */
export async function getCohereRerankProvider(
  config: ProviderConfig
): Promise<RerankProviderResult | null> {
  const keyResult = await getEffectiveApiKey(config.userId, "cohere");

  if (!keyResult) {
    return null;
  }

  const provider = new CohereRerankProvider({
    apiKey: keyResult.apiKey,
  });

  return {
    provider,
    source: keyResult.source,
    keyId: keyResult.keyId,
    recordUsage: async (costUsd?: number) => {
      if (keyResult.keyId) {
        await recordKeyUsage(keyResult.keyId, costUsd);
      }
    },
  };
}

/**
 * Get OpenAI API key with BYOK support (for direct API calls)
 */
export async function getOpenAIKey(
  config: ProviderConfig
): Promise<{ apiKey: string; source: "byok" | "managed"; keyId?: string } | null> {
  return getEffectiveApiKey(config.userId, "openai");
}

/**
 * Get Anthropic API key with BYOK support
 */
export async function getAnthropicKey(
  config: ProviderConfig
): Promise<{ apiKey: string; source: "byok" | "managed"; keyId?: string } | null> {
  return getEffectiveApiKey(config.userId, "anthropic");
}

/**
 * Get Google AI API key with BYOK support
 */
export async function getGoogleKey(
  config: ProviderConfig
): Promise<{ apiKey: string; source: "byok" | "managed"; keyId?: string } | null> {
  return getEffectiveApiKey(config.userId, "google");
}

/**
 * Check if user has any BYOK keys configured
 */
export async function hasUserBYOKKeys(userId: string): Promise<boolean> {
  const providers: Provider[] = ["openai", "anthropic", "cohere", "voyage", "google", "azure"];

  for (const provider of providers) {
    const key = await getEffectiveApiKey(userId, provider);
    if (key?.source === "byok") {
      return true;
    }
  }

  return false;
}
