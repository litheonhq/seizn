/**
 * BYOK KMS Manager
 *
 * Manages KMS configurations and encryption operations.
 * Handles:
 * - KMS configuration CRUD
 * - Provider client instantiation
 * - Data encryption key (DEK) management
 * - Key rotation workflows
 */

import { createServerClient } from '@/lib/supabase';
import { encryptJson, decryptJson } from '@/lib/winter/crypto';
import { logAuditEvent } from '@/lib/winter/org/audit-log';
import { AwsKmsClient } from './providers/aws';
import { GcpKmsClient } from './providers/gcp';
import { AzureKeyVaultClient } from './providers/azure';
import type {
  KmsConfig,
  KmsProvider,
  ProviderConfig,
  CreateKmsConfigParams,
  UpdateKmsConfigParams,
  ListKmsConfigsParams,
  ValidateKmsResult,
  RotationHistory,
  DataEncryptionKey,
  DekPurpose,
  KmsProviderClient,
  EncryptRequest,
  EncryptResult,
  DecryptRequest,
  DecryptResult,
} from './types';
import type { PaginatedResult } from '@/lib/winter/org/types';

// ============================================
// KMS Configuration CRUD
// ============================================

/**
 * Create a new KMS configuration
 */
export async function createKmsConfig(
  params: CreateKmsConfigParams
): Promise<KmsConfig> {
  const supabase = createServerClient();

  // Encrypt the provider config before storing
  const providerConfigEncrypted = encryptJson(params.provider_config);

  // Calculate next rotation date if rotation is enabled
  let nextRotationAt: string | undefined;
  if (params.rotation_enabled && params.rotation_interval_days) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + params.rotation_interval_days);
    nextRotationAt = nextDate.toISOString();
  }

  const { data, error } = await supabase
    .from('byok_kms_configs')
    .insert({
      organization_id: params.organization_id,
      provider: params.provider,
      name: params.name,
      description: params.description,
      key_reference: params.key_reference,
      provider_config_encrypted: providerConfigEncrypted,
      key_algorithm: params.key_algorithm || 'AES_256',
      key_usage: params.key_usage || 'ENCRYPT_DECRYPT',
      rotation_enabled: params.rotation_enabled || false,
      rotation_interval_days: params.rotation_interval_days || 90,
      next_rotation_at: nextRotationAt,
      is_default: params.is_default || false,
      validation_status: 'pending',
      created_by: params.created_by,
    })
    .select()
    .single();

  if (error) throw error;

  // If marked as default, unset other defaults
  if (params.is_default) {
    await supabase
      .from('byok_kms_configs')
      .update({ is_default: false })
      .eq('organization_id', params.organization_id)
      .neq('id', data.id);
  }

  // Log audit event
  await logAuditEvent({
    user_id: params.created_by,
    organization_id: params.organization_id,
    action: 'api_key.create',
    resource_type: 'settings',
    resource_id: data.id,
    details: {
      type: 'kms_config',
      provider: params.provider,
      name: params.name,
    },
    status: 'success',
  });

  // Validate the KMS configuration asynchronously
  validateKmsConfigAsync(data.id).catch(console.error);

  return data as KmsConfig;
}

/**
 * Get a KMS configuration by ID
 */
export async function getKmsConfig(configId: string): Promise<KmsConfig | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('byok_kms_configs')
    .select('*')
    .eq('id', configId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as KmsConfig;
}

/**
 * Get the default KMS configuration for an organization
 */
export async function getDefaultKmsConfig(
  organizationId: string
): Promise<KmsConfig | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('byok_kms_configs')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .eq('is_default', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as KmsConfig;
}

/**
 * List KMS configurations for an organization
 */
export async function listKmsConfigs(
  params: ListKmsConfigsParams
): Promise<PaginatedResult<KmsConfig>> {
  const supabase = createServerClient();
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('byok_kms_configs')
    .select('*', { count: 'exact' })
    .eq('organization_id', params.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.provider) {
    query = query.eq('provider', params.provider);
  }

  if (params.is_active !== undefined) {
    query = query.eq('is_active', params.is_active);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: (data || []) as KmsConfig[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Update a KMS configuration
 */
export async function updateKmsConfig(
  params: UpdateKmsConfigParams,
  updatedBy: string
): Promise<KmsConfig> {
  const supabase = createServerClient();

  // Get current config for audit
  const current = await getKmsConfig(params.id);
  if (!current) {
    throw new Error('KMS configuration not found');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.is_active !== undefined) updates.is_active = params.is_active;
  if (params.rotation_enabled !== undefined) {
    updates.rotation_enabled = params.rotation_enabled;
    if (params.rotation_enabled && params.rotation_interval_days) {
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + params.rotation_interval_days);
      updates.next_rotation_at = nextDate.toISOString();
    }
  }
  if (params.rotation_interval_days !== undefined) {
    updates.rotation_interval_days = params.rotation_interval_days;
  }

  // Handle provider config update (merge with existing)
  if (params.provider_config) {
    const existingConfig = decryptJson<ProviderConfig>(current.provider_config_encrypted);
    const mergedConfig = { ...existingConfig, ...params.provider_config };
    updates.provider_config_encrypted = encryptJson(mergedConfig);
    // Reset validation status when config changes
    updates.validation_status = 'pending';
  }

  // Handle default flag
  if (params.is_default) {
    // Unset other defaults first
    await supabase
      .from('byok_kms_configs')
      .update({ is_default: false })
      .eq('organization_id', current.organization_id)
      .neq('id', params.id);
    updates.is_default = true;
  }

  const { data, error } = await supabase
    .from('byok_kms_configs')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: current.organization_id,
    action: 'api_key.revoke', // Using closest available action
    resource_type: 'settings',
    resource_id: params.id,
    details: {
      type: 'kms_config_update',
      updated_fields: Object.keys(params).filter(k => k !== 'id'),
    },
    status: 'success',
  });

  // Re-validate if config changed
  if (params.provider_config) {
    validateKmsConfigAsync(data.id).catch(console.error);
  }

  return data as KmsConfig;
}

/**
 * Delete a KMS configuration
 */
export async function deleteKmsConfig(
  configId: string,
  deletedBy: string
): Promise<void> {
  const supabase = createServerClient();

  // Get config for audit
  const config = await getKmsConfig(configId);
  if (!config) {
    throw new Error('KMS configuration not found');
  }

  // Check if there are active DEKs using this config
  const { count } = await supabase
    .from('byok_data_encryption_keys')
    .select('id', { count: 'exact', head: true })
    .eq('kms_config_id', configId)
    .eq('is_active', true);

  if (count && count > 0) {
    throw new Error('Cannot delete KMS config with active encryption keys. Deactivate keys first.');
  }

  const { error } = await supabase
    .from('byok_kms_configs')
    .delete()
    .eq('id', configId);

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: deletedBy,
    organization_id: config.organization_id,
    action: 'api_key.revoke',
    resource_type: 'settings',
    resource_id: configId,
    details: {
      type: 'kms_config_delete',
      provider: config.provider,
      name: config.name,
    },
    status: 'success',
  });
}

// ============================================
// KMS Validation
// ============================================

/**
 * Validate a KMS configuration
 */
export async function validateKmsConfig(configId: string): Promise<ValidateKmsResult> {
  const config = await getKmsConfig(configId);
  if (!config) {
    throw new Error('KMS configuration not found');
  }

  const client = await getKmsClient(configId);
  const result = await client.validate();

  // Update validation status
  const supabase = createServerClient();
  await supabase
    .from('byok_kms_configs')
    .update({
      validation_status: result.valid ? 'valid' : 'invalid',
      validation_error: result.error,
      last_validated_at: new Date().toISOString(),
    })
    .eq('id', configId);

  return result;
}

/**
 * Validate KMS configuration asynchronously (fire and forget)
 */
async function validateKmsConfigAsync(configId: string): Promise<void> {
  try {
    await validateKmsConfig(configId);
  } catch (error) {
    console.error('KMS validation failed:', error);

    // Update status to error
    const supabase = createServerClient();
    await supabase
      .from('byok_kms_configs')
      .update({
        validation_status: 'error',
        validation_error: error instanceof Error ? error.message : 'Unknown error',
        last_validated_at: new Date().toISOString(),
      })
      .eq('id', configId);
  }
}

// ============================================
// KMS Client Factory
// ============================================

/**
 * Get a KMS provider client for a configuration
 */
export async function getKmsClient(configId: string): Promise<KmsProviderClient> {
  const config = await getKmsConfig(configId);
  if (!config) {
    throw new Error('KMS configuration not found');
  }

  // Decrypt provider config
  const providerConfig = decryptJson<ProviderConfig>(config.provider_config_encrypted);

  switch (config.provider) {
    case 'aws_kms':
      return new AwsKmsClient(config.key_reference, providerConfig as ProviderConfig & { provider: 'aws_kms' });
    case 'gcp_kms':
      return new GcpKmsClient(config.key_reference, providerConfig as ProviderConfig & { provider: 'gcp_kms' });
    case 'azure_keyvault':
      return new AzureKeyVaultClient(config.key_reference, providerConfig as ProviderConfig & { provider: 'azure_keyvault' });
    default:
      throw new Error(`Unsupported KMS provider: ${config.provider}`);
  }
}

// ============================================
// Key Rotation
// ============================================

/**
 * Initiate key rotation for a KMS configuration
 */
export async function rotateKmsKey(
  configId: string,
  initiatedBy: string,
  rotationType: 'manual' | 'scheduled' | 'emergency' = 'manual'
): Promise<RotationHistory> {
  const supabase = createServerClient();

  const config = await getKmsConfig(configId);
  if (!config) {
    throw new Error('KMS configuration not found');
  }

  // Create rotation history record
  const { data: rotationRecord, error: insertError } = await supabase
    .from('byok_kms_rotation_history')
    .insert({
      kms_config_id: configId,
      previous_key_reference: config.key_reference,
      new_key_reference: config.key_reference, // Will be updated
      rotation_type: rotationType,
      status: 'in_progress',
      initiated_by: initiatedBy,
    })
    .select()
    .single();

  if (insertError) throw insertError;

  try {
    // Get KMS client and rotate
    const client = await getKmsClient(configId);

    if (!client.rotateKey) {
      throw new Error('Key rotation not supported by this provider');
    }

    const newKeyReference = await client.rotateKey();

    // Update rotation record
    await supabase
      .from('byok_kms_rotation_history')
      .update({
        new_key_reference: newKeyReference,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', rotationRecord.id);

    // Update KMS config with new key reference and rotation timestamp
    const nextRotationAt = config.rotation_enabled
      ? new Date(Date.now() + config.rotation_interval_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    await supabase
      .from('byok_kms_configs')
      .update({
        key_reference: newKeyReference,
        last_rotated_at: new Date().toISOString(),
        next_rotation_at: nextRotationAt,
      })
      .eq('id', configId);

    // Log audit event
    await logAuditEvent({
      user_id: initiatedBy,
      organization_id: config.organization_id,
      action: 'api_key.rotate',
      resource_type: 'settings',
      resource_id: configId,
      details: {
        type: 'kms_key_rotation',
        rotation_type: rotationType,
        provider: config.provider,
      },
      status: 'success',
    });

    return {
      ...rotationRecord,
      new_key_reference: newKeyReference,
      status: 'completed',
      completed_at: new Date().toISOString(),
    } as RotationHistory;
  } catch (error) {
    // Update rotation record with error
    await supabase
      .from('byok_kms_rotation_history')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', rotationRecord.id);

    throw error;
  }
}

/**
 * Get rotation history for a KMS configuration
 */
export async function getRotationHistory(
  configId: string,
  limit: number = 50
): Promise<RotationHistory[]> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('byok_kms_rotation_history')
    .select('*')
    .eq('kms_config_id', configId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data || []) as RotationHistory[];
}

// ============================================
// Data Encryption Keys (DEK) Management
// ============================================

/**
 * Generate or get an active DEK for a purpose
 */
export async function getOrCreateDek(
  organizationId: string,
  purpose: DekPurpose
): Promise<DataEncryptionKey> {
  const supabase = createServerClient();

  // Try to get existing active DEK
  const { data: existingDek } = await supabase
    .from('byok_data_encryption_keys')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('purpose', purpose)
    .eq('is_active', true)
    .order('key_version', { ascending: false })
    .limit(1)
    .single();

  if (existingDek) {
    return existingDek as DataEncryptionKey;
  }

  // Get default KMS config for org
  const kmsConfig = await getDefaultKmsConfig(organizationId);
  if (!kmsConfig) {
    throw new Error('No KMS configuration found for organization');
  }

  // Generate new DEK
  const client = await getKmsClient(kmsConfig.id);
  const { ciphertext: wrappedKey } = await client.generateDataKey!();

  // Get current max version
  const { data: versionData } = await supabase
    .from('byok_data_encryption_keys')
    .select('key_version')
    .eq('organization_id', organizationId)
    .eq('purpose', purpose)
    .order('key_version', { ascending: false })
    .limit(1)
    .single();

  const newVersion = (versionData?.key_version || 0) + 1;

  // Store wrapped DEK
  const { data: newDek, error } = await supabase
    .from('byok_data_encryption_keys')
    .insert({
      kms_config_id: kmsConfig.id,
      organization_id: organizationId,
      purpose,
      wrapped_key: wrappedKey,
      key_version: newVersion,
      algorithm: 'AES_256_GCM',
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  return newDek as DataEncryptionKey;
}

/**
 * Get a specific DEK by ID and version
 */
export async function getDek(
  dekId: string,
  version?: number
): Promise<DataEncryptionKey | null> {
  const supabase = createServerClient();

  let query = supabase
    .from('byok_data_encryption_keys')
    .select('*')
    .eq('id', dekId);

  if (version !== undefined) {
    query = query.eq('key_version', version);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as DataEncryptionKey;
}

// ============================================
// Encryption Operations
// ============================================

/**
 * Encrypt data using BYOK
 */
export async function encryptWithByok(
  request: EncryptRequest
): Promise<EncryptResult> {
  const crypto = await import('crypto');

  // Get or create DEK
  const dek = await getOrCreateDek(request.organization_id, request.purpose);

  // Get KMS client to unwrap DEK
  const client = await getKmsClient(dek.kms_config_id);
  const unwrappedKey = await client.unwrapKey(dek.wrapped_key);

  // Generate IV
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM

  // Encrypt data
  const cipher = crypto.createCipheriv('aes-256-gcm', unwrappedKey, iv);

  // Add AAD if provided
  let contextHash: string | undefined;
  if (request.context) {
    const contextString = JSON.stringify(request.context);
    cipher.setAAD(Buffer.from(contextString, 'utf-8'));
    contextHash = crypto.createHash('sha256').update(contextString).digest('hex');
  }

  const plaintext = typeof request.plaintext === 'string'
    ? Buffer.from(request.plaintext, 'utf-8')
    : request.plaintext;

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Format: [12B iv][16B tag][ciphertext]
  const result = Buffer.concat([iv, authTag, ciphertext]).toString('base64');

  // Clear sensitive data from memory
  unwrappedKey.fill(0);

  return {
    ciphertext: result,
    dek_id: dek.id,
    dek_version: dek.key_version,
    algorithm: dek.algorithm as EncryptResult['algorithm'],
    context_hash: contextHash,
  };
}

/**
 * Decrypt data using BYOK
 */
export async function decryptWithByok(
  request: DecryptRequest
): Promise<DecryptResult> {
  const crypto = await import('crypto');

  // Get DEK
  const dek = await getDek(request.dek_id, request.dek_version);
  if (!dek) {
    throw new Error('Data encryption key not found');
  }

  // Get KMS client to unwrap DEK
  const client = await getKmsClient(dek.kms_config_id);
  const unwrappedKey = await client.unwrapKey(dek.wrapped_key);

  // Parse ciphertext
  const buf = Buffer.from(request.ciphertext, 'base64');
  if (buf.length < 28) { // 12 (IV) + 16 (tag) = 28 minimum
    throw new Error('Invalid ciphertext format');
  }

  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);

  // Decrypt
  const decipher = crypto.createDecipheriv('aes-256-gcm', unwrappedKey, iv);
  decipher.setAuthTag(authTag);

  // Add AAD if provided
  if (request.context) {
    const contextString = JSON.stringify(request.context);
    decipher.setAAD(Buffer.from(contextString, 'utf-8'));
  }

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // Clear sensitive data from memory
  unwrappedKey.fill(0);

  return { plaintext };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Check if an organization has BYOK enabled
 */
export async function hasOrganizationByok(organizationId: string): Promise<boolean> {
  const config = await getDefaultKmsConfig(organizationId);
  return config !== null && config.is_active && config.validation_status === 'valid';
}

/**
 * Get KMS provider display name
 */
export function getProviderDisplayName(provider: KmsProvider): string {
  switch (provider) {
    case 'aws_kms':
      return 'AWS Key Management Service';
    case 'gcp_kms':
      return 'Google Cloud KMS';
    case 'azure_keyvault':
      return 'Azure Key Vault';
    default:
      return provider;
  }
}
