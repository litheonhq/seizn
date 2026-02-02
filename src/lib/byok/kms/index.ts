/**
 * BYOK KMS Module
 *
 * Customer-managed encryption key support for:
 * - AWS Key Management Service (KMS)
 * - Google Cloud KMS
 * - Azure Key Vault
 *
 * Features:
 * - Key reference storage (not actual keys)
 * - Key rotation workflows
 * - Data encryption key (DEK) management
 * - Envelope encryption pattern
 */

// Types
export * from './types';

// Provider clients
export {
  AwsKmsClient,
  parseAwsKmsArn,
  isValidAwsKmsKeyReference,
  GcpKmsClient,
  parseGcpKmsResourceName,
  buildGcpKmsResourceName,
  isValidGcpKmsKeyReference,
  AzureKeyVaultClient,
  parseAzureKeyVaultUrl,
  buildAzureKeyVaultUrl,
  isValidAzureKeyVaultUrl,
} from './providers';

// Manager functions
export {
  // KMS Config CRUD
  createKmsConfig,
  getKmsConfig,
  getDefaultKmsConfig,
  listKmsConfigs,
  updateKmsConfig,
  deleteKmsConfig,

  // Validation
  validateKmsConfig,

  // Client factory
  getKmsClient,

  // Key rotation
  rotateKmsKey,
  getRotationHistory,

  // DEK management
  getOrCreateDek,
  getDek,

  // Encryption operations
  encryptWithByok,
  decryptWithByok,

  // Utilities
  hasOrganizationByok,
  getProviderDisplayName,
} from './manager';
