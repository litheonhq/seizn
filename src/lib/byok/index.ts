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
 *
 * Also includes enterprise KMS integration for:
 * - AWS KMS
 * - Google Cloud KMS
 * - Azure Key Vault
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

// KMS (Key Management Service) exports
export {
  // Types
  type KmsConfig,
  type KmsProvider,
  type AwsKmsConfig,
  type GcpKmsConfig,
  type AzureKeyVaultConfig,
  type ProviderConfig,
  type RotationHistory,
  type DataEncryptionKey,
  type EncryptRequest,
  type EncryptResult,
  type DecryptRequest,
  type DecryptResult,
  // Functions
  createKmsConfig,
  getKmsConfig,
  listKmsConfigs,
  updateKmsConfig,
  deleteKmsConfig,
  validateKmsConfig,
  rotateKmsKey,
  getRotationHistory,
  getOrCreateDek,
  getDek,
  encryptWithByok,
  decryptWithByok,
  getProviderDisplayName,
  // Validation helpers
  isValidAwsKmsKeyReference,
  isValidGcpKmsKeyReference,
  isValidAzureKeyVaultUrl,
} from "./kms";
