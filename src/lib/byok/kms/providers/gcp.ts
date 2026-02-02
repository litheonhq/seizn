/**
 * GCP Cloud KMS Provider Client
 *
 * Integrates with Google Cloud Key Management Service for BYOK encryption.
 * Supports:
 * - Service account authentication
 * - Workload Identity Federation
 * - Key rotation
 */

import type {
  KmsProviderClient,
  GcpKmsConfig,
  ValidateKmsResult,
} from '../types';

export class GcpKmsClient implements KmsProviderClient {
  readonly provider = 'gcp_kms' as const;
  private config: GcpKmsConfig;
  private keyReference: string;

  constructor(keyReference: string, config: GcpKmsConfig) {
    this.keyReference = keyReference;
    this.config = config;
  }

  /**
   * Validate KMS key access and configuration
   */
  async validate(): Promise<ValidateKmsResult> {
    try {
      const { KeyManagementServiceClient } = await import('@google-cloud/kms');

      const client = await this.createClient(KeyManagementServiceClient);
      const [cryptoKey] = await client.getCryptoKey({
        name: this.keyReference,
      });

      if (!cryptoKey) {
        return {
          valid: false,
          provider: 'gcp_kms',
          key_reference: this.keyReference,
          error: 'Key not found',
        };
      }

      const stateValue = cryptoKey.primary?.state;
      const enabled = stateValue === 'ENABLED' || stateValue === 2; // 2 is ENABLED enum value

      return {
        valid: enabled,
        provider: 'gcp_kms',
        key_reference: this.keyReference,
        key_metadata: {
          key_id: cryptoKey.name || '',
          key_state: String(stateValue || 'Unknown'),
          creation_date: cryptoKey.createTime
            ? new Date(cryptoKey.createTime as string).toISOString()
            : undefined,
          description: cryptoKey.labels?.description,
          enabled,
          key_spec: cryptoKey.versionTemplate?.algorithm ? String(cryptoKey.versionTemplate.algorithm) : undefined,
        },
        error: enabled ? undefined : 'Key is not enabled',
      };
    } catch (error) {
      return {
        valid: false,
        provider: 'gcp_kms',
        key_reference: this.keyReference,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wrap a Data Encryption Key (DEK) using the GCP KMS Key Encryption Key (KEK)
   */
  async wrapKey(dek: Buffer): Promise<string> {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');

    const client = await this.createClient(KeyManagementServiceClient);
    const [result] = await client.encrypt({
      name: this.keyReference,
      plaintext: dek,
    });

    if (!result.ciphertext) {
      throw new Error('Failed to wrap key: No ciphertext returned');
    }

    return Buffer.from(result.ciphertext as Uint8Array).toString('base64');
  }

  /**
   * Unwrap a Data Encryption Key (DEK)
   */
  async unwrapKey(wrappedKey: string): Promise<Buffer> {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');

    const client = await this.createClient(KeyManagementServiceClient);
    const [result] = await client.decrypt({
      name: this.keyReference,
      ciphertext: Buffer.from(wrappedKey, 'base64'),
    });

    if (!result.plaintext) {
      throw new Error('Failed to unwrap key: No plaintext returned');
    }

    return Buffer.from(result.plaintext as Uint8Array);
  }

  /**
   * Generate a new Data Encryption Key
   * Note: GCP KMS doesn't have a direct GenerateDataKey API like AWS
   * We generate locally and wrap with KMS
   */
  async generateDataKey(): Promise<{ plaintext: Buffer; ciphertext: string }> {
    const crypto = await import('crypto');

    // Generate a 256-bit (32 bytes) random key
    const plaintext = crypto.randomBytes(32);

    // Wrap it with KMS
    const ciphertext = await this.wrapKey(plaintext);

    return { plaintext, ciphertext };
  }

  /**
   * Get key metadata
   */
  async getKeyMetadata(): Promise<ValidateKmsResult['key_metadata']> {
    const result = await this.validate();
    return result.key_metadata;
  }

  /**
   * Rotate the KMS key (creates new key version)
   */
  async rotateKey(): Promise<string> {
    const { KeyManagementServiceClient } = await import('@google-cloud/kms');

    const client = await this.createClient(KeyManagementServiceClient);

    // Create a new key version
    const [cryptoKeyVersion] = await client.createCryptoKeyVersion({
      parent: this.keyReference,
      cryptoKeyVersion: {
        state: 'ENABLED',
      },
    });

    if (!cryptoKeyVersion.name) {
      throw new Error('Failed to create new key version');
    }

    // Update the primary version
    await client.updateCryptoKeyPrimaryVersion({
      name: this.keyReference,
      cryptoKeyVersionId: cryptoKeyVersion.name.split('/').pop() || '',
    });

    // Return the same key reference (primary version is updated internally)
    return this.keyReference;
  }

  /**
   * Create GCP KMS client with proper credentials
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createClient<T extends new (opts?: any) => any>(
    ClientClass: T
  ): Promise<InstanceType<T>> {
    const options: Record<string, unknown> = {
      projectId: this.config.project_id,
    };

    // Use service account JSON if provided
    if (this.config.service_account_json) {
      try {
        const credentials = JSON.parse(this.config.service_account_json);
        options.credentials = credentials;
      } catch {
        throw new Error('Invalid service account JSON');
      }
    }

    return new ClientClass(options) as InstanceType<T>;
  }
}

/**
 * Parse GCP Cloud KMS key resource name
 */
export function parseGcpKmsResourceName(resourceName: string): {
  projectId: string;
  location: string;
  keyRing: string;
  cryptoKey: string;
  version?: string;
} | null {
  // Format: projects/{project}/locations/{location}/keyRings/{keyRing}/cryptoKeys/{cryptoKey}
  // Optional: /cryptoKeyVersions/{version}
  const regex = /^projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+)(?:\/cryptoKeyVersions\/([^/]+))?$/;
  const match = resourceName.match(regex);

  if (!match) {
    return null;
  }

  return {
    projectId: match[1],
    location: match[2],
    keyRing: match[3],
    cryptoKey: match[4],
    version: match[5],
  };
}

/**
 * Build GCP KMS key resource name
 */
export function buildGcpKmsResourceName(params: {
  projectId: string;
  location: string;
  keyRing: string;
  cryptoKey: string;
  version?: string;
}): string {
  let resourceName = `projects/${params.projectId}/locations/${params.location}/keyRings/${params.keyRing}/cryptoKeys/${params.cryptoKey}`;

  if (params.version) {
    resourceName += `/cryptoKeyVersions/${params.version}`;
  }

  return resourceName;
}

/**
 * Validate GCP KMS key reference format
 */
export function isValidGcpKmsKeyReference(keyReference: string): boolean {
  const regex = /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/;
  return regex.test(keyReference);
}
