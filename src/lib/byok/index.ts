/**
 * BYOK (Bring Your Own Key) Module
 *
 * Allows users to connect their own API keys for AI providers
 * (OpenAI, Anthropic, Cohere, Voyage, Google, Azure)
 *
 * Benefits:
 * - Cost control: Pay providers directly
 * - Compliance: Keep API traffic within existing agreements
 * - Flexibility: Switch providers without code changes
 */

export {
  encryptApiKey,
  decryptApiKey,
  generateKeyHint,
  maskApiKey,
  validateKeyFormat,
} from "./encryption";

export {
  getUserProviderKey,
  getAllUserProviderKeys,
  recordKeyUsage,
  getEffectiveApiKey,
  type Provider,
  type ProviderKey,
} from "./provider-client";

export {
  getVoyageEmbeddingProvider,
  getCohereRerankProvider,
  getOpenAIKey,
  getAnthropicKey,
  getGoogleKey,
  hasUserBYOKKeys,
} from "./provider-factory";
