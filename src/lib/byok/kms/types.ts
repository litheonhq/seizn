/**
 * BYOK KMS (Key Management Service) Types
 *
 * Type definitions for customer-managed encryption keys:
 * - AWS KMS
 * - GCP Cloud KMS
 * - Azure Key Vault
 */

// ============================================
// KMS Provider Types
// ============================================

export type KmsProvider = 'aws_kms' | 'gcp_kms' | 'azure_keyvault';

export interface KmsConfig {
  id: string;
  organization_id: string;
  provider: KmsProvider;
  name: string;
  description?: string;

  // Key reference (ARN/Resource ID - NOT the actual key)
  key_reference: string;

  // Provider-specific config (encrypted)
  provider_config_encrypted: string;

  // Status
  is_active: boolean;
  is_default: boolean;

  // Key metadata
  key_algorithm: KeyAlgorithm;
  key_usage: KeyUsage;

  // Rotation settings
  rotation_enabled: boolean;
  rotation_interval_days: number;
  last_rotated_at?: string;
  next_rotation_at?: string;

  // Validation
  last_validated_at?: string;
  validation_status: ValidationStatus;
  validation_error?: string;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type KeyAlgorithm =
  | 'AES_256'
  | 'AES_128'
  | 'RSA_2048'
  | 'RSA_4096'
  | 'ECC_P256'
  | 'ECC_P384';

export type KeyUsage = 'ENCRYPT_DECRYPT' | 'SIGN_VERIFY' | 'GENERATE_DATA_KEY';

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'error';

// ============================================
// Provider-Specific Configurations
// ============================================

export interface AwsKmsConfig {
  provider: 'aws_kms';
  region: string;
  // ARN of the IAM role to assume for cross-account access
  role_arn?: string;
  // External ID for secure role assumption
  external_id?: string;
  // AWS access credentials (optional - prefer IAM roles)
  access_key_id?: string;
  secret_access_key?: string;
}

export interface GcpKmsConfig {
  provider: 'gcp_kms';
  project_id: string;
  location: string;
  key_ring: string;
  // Service account JSON (encrypted)
  service_account_json?: string;
  // For Workload Identity Federation
  workload_identity_provider?: string;
}

export interface AzureKeyVaultConfig {
  provider: 'azure_keyvault';
  vault_url: string;
  tenant_id: string;
  client_id: string;
  // Client secret (encrypted) - for Service Principal auth
  client_secret?: string;
  // For Managed Identity
  use_managed_identity?: boolean;
}

export type ProviderConfig = AwsKmsConfig | GcpKmsConfig | AzureKeyVaultConfig;

// ============================================
// Key Rotation Types
// ============================================

export interface RotationHistory {
  id: string;
  kms_config_id: string;
  previous_key_reference?: string;
  new_key_reference: string;
  rotation_type: RotationType;
  status: RotationStatus;
  started_at: string;
  completed_at?: string;
  error_message?: string;
  initiated_by?: string;
  created_at: string;
}

export type RotationType = 'scheduled' | 'manual' | 'emergency';
export type RotationStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';

// ============================================
// Data Encryption Key (DEK) Types
// ============================================

export interface DataEncryptionKey {
  id: string;
  kms_config_id: string;
  organization_id: string;
  purpose: DekPurpose;
  wrapped_key: string; // DEK encrypted by KMS KEK
  key_version: number;
  algorithm: DekAlgorithm;
  is_active: boolean;
  created_at: string;
  expires_at?: string;
}

export type DekPurpose = 'memories' | 'documents' | 'traces' | 'general';
export type DekAlgorithm = 'AES_256_GCM' | 'AES_128_GCM' | 'CHACHA20_POLY1305';

// ============================================
// CRUD Types
// ============================================

export interface CreateKmsConfigParams {
  organization_id: string;
  provider: KmsProvider;
  name: string;
  description?: string;
  key_reference: string;
  provider_config: ProviderConfig;
  key_algorithm?: KeyAlgorithm;
  key_usage?: KeyUsage;
  rotation_enabled?: boolean;
  rotation_interval_days?: number;
  is_default?: boolean;
  created_by: string;
}

export interface UpdateKmsConfigParams {
  id: string;
  name?: string;
  description?: string;
  provider_config?: Partial<ProviderConfig>;
  rotation_enabled?: boolean;
  rotation_interval_days?: number;
  is_active?: boolean;
  is_default?: boolean;
}

export interface ListKmsConfigsParams {
  organization_id: string;
  provider?: KmsProvider;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================
// Encryption/Decryption Types
// ============================================

export interface EncryptRequest {
  organization_id: string;
  purpose: DekPurpose;
  plaintext: string | Buffer;
  context?: Record<string, string>; // Additional authenticated data (AAD)
}

export interface EncryptResult {
  ciphertext: string; // Base64 encoded
  dek_id: string;
  dek_version: number;
  algorithm: DekAlgorithm;
  context_hash?: string;
}

export interface DecryptRequest {
  organization_id: string;
  ciphertext: string;
  dek_id: string;
  dek_version: number;
  context?: Record<string, string>;
}

export interface DecryptResult {
  plaintext: Buffer;
}

// ============================================
// Validation Types
// ============================================

export interface ValidateKmsResult {
  valid: boolean;
  provider: KmsProvider;
  key_reference: string;
  key_metadata?: {
    key_id: string;
    key_state: string;
    creation_date?: string;
    description?: string;
    enabled: boolean;
    key_spec?: string;
  };
  error?: string;
}

// ============================================
// KMS Provider Interface
// ============================================

export interface KmsProviderClient {
  provider: KmsProvider;

  // Validate connection and key access
  validate(): Promise<ValidateKmsResult>;

  // Wrap a DEK with the KEK
  wrapKey(dek: Buffer): Promise<string>;

  // Unwrap a DEK
  unwrapKey(wrappedKey: string): Promise<Buffer>;

  // Generate a new DEK (optional - some providers support this)
  generateDataKey?(): Promise<{ plaintext: Buffer; ciphertext: string }>;

  // Get key metadata
  getKeyMetadata(): Promise<ValidateKmsResult['key_metadata']>;

  // Rotate key (if supported)
  rotateKey?(): Promise<string>; // Returns new key reference
}
