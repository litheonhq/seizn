/**
 * Azure Key Vault Provider Client
 *
 * Integrates with Azure Key Vault for BYOK encryption.
 * Supports:
 * - Service Principal authentication
 * - Managed Identity authentication
 * - Key rotation
 */

import type {
  KmsProviderClient,
  AzureKeyVaultConfig,
  ValidateKmsResult,
} from '../types';

export class AzureKeyVaultClient implements KmsProviderClient {
  readonly provider = 'azure_keyvault' as const;
  private config: AzureKeyVaultConfig;
  private keyReference: string;

  constructor(keyReference: string, config: AzureKeyVaultConfig) {
    this.keyReference = keyReference;
    this.config = config;
  }

  /**
   * Validate Key Vault key access and configuration
   */
  async validate(): Promise<ValidateKmsResult> {
    try {
      const { KeyClient } = await import('@azure/keyvault-keys');
      const { DefaultAzureCredential, ClientSecretCredential } = await import('@azure/identity');

      const credential = this.createCredential(ClientSecretCredential, DefaultAzureCredential);
      const client = new KeyClient(this.config.vault_url, credential);

      const parsedRef = parseAzureKeyVaultUrl(this.keyReference);
      if (!parsedRef) {
        return {
          valid: false,
          provider: 'azure_keyvault',
          key_reference: this.keyReference,
          error: 'Invalid key reference format',
        };
      }

      const key = await client.getKey(parsedRef.keyName, {
        version: parsedRef.version,
      });

      if (!key) {
        return {
          valid: false,
          provider: 'azure_keyvault',
          key_reference: this.keyReference,
          error: 'Key not found',
        };
      }

      const enabled = key.properties.enabled === true;

      return {
        valid: enabled,
        provider: 'azure_keyvault',
        key_reference: this.keyReference,
        key_metadata: {
          key_id: key.id || '',
          key_state: enabled ? 'Enabled' : 'Disabled',
          creation_date: key.properties.createdOn?.toISOString(),
          description: key.properties.tags?.description,
          enabled,
          key_spec: key.keyType,
        },
        error: enabled ? undefined : 'Key is not enabled',
      };
    } catch (error) {
      return {
        valid: false,
        provider: 'azure_keyvault',
        key_reference: this.keyReference,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wrap a Data Encryption Key (DEK) using Azure Key Vault
   */
  async wrapKey(dek: Buffer): Promise<string> {
    const { CryptographyClient, KnownKeyWrapAlgorithm } = await import('@azure/keyvault-keys');
    const { DefaultAzureCredential, ClientSecretCredential } = await import('@azure/identity');

    const credential = this.createCredential(ClientSecretCredential, DefaultAzureCredential);
    const cryptoClient = new CryptographyClient(this.keyReference, credential);

    const result = await cryptoClient.wrapKey(KnownKeyWrapAlgorithm.A256KW, dek);

    return Buffer.from(result.result).toString('base64');
  }

  /**
   * Unwrap a Data Encryption Key (DEK)
   */
  async unwrapKey(wrappedKey: string): Promise<Buffer> {
    const { CryptographyClient, KnownKeyWrapAlgorithm } = await import('@azure/keyvault-keys');
    const { DefaultAzureCredential, ClientSecretCredential } = await import('@azure/identity');

    const credential = this.createCredential(ClientSecretCredential, DefaultAzureCredential);
    const cryptoClient = new CryptographyClient(this.keyReference, credential);

    const result = await cryptoClient.unwrapKey(
      KnownKeyWrapAlgorithm.A256KW,
      Buffer.from(wrappedKey, 'base64')
    );

    return Buffer.from(result.result);
  }

  /**
   * Generate a new Data Encryption Key
   * Note: Azure Key Vault doesn't have a direct GenerateDataKey API
   * We generate locally and wrap with Key Vault
   */
  async generateDataKey(): Promise<{ plaintext: Buffer; ciphertext: string }> {
    const crypto = await import('crypto');

    // Generate a 256-bit (32 bytes) random key
    const plaintext = crypto.randomBytes(32);

    // Wrap it with Key Vault
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
   * Rotate the key (creates new key version)
   */
  async rotateKey(): Promise<string> {
    const { KeyClient } = await import('@azure/keyvault-keys');
    const { DefaultAzureCredential, ClientSecretCredential } = await import('@azure/identity');

    const credential = this.createCredential(ClientSecretCredential, DefaultAzureCredential);
    const client = new KeyClient(this.config.vault_url, credential);

    const parsedRef = parseAzureKeyVaultUrl(this.keyReference);
    if (!parsedRef) {
      throw new Error('Invalid key reference format');
    }

    // Rotate creates a new version
    const newKey = await client.rotateKey(parsedRef.keyName);

    if (!newKey.id) {
      throw new Error('Failed to rotate key');
    }

    // Return the new key reference (with new version)
    return newKey.id;
  }

  /**
   * Create Azure credential based on configuration
   */
  private createCredential(
    ClientSecretCredential: new (
      tenantId: string,
      clientId: string,
      clientSecret: string
    ) => unknown,
    DefaultAzureCredential: new () => unknown
  ): unknown {
    // Use Service Principal if client_secret is provided
    if (this.config.client_secret && !this.config.use_managed_identity) {
      return new ClientSecretCredential(
        this.config.tenant_id,
        this.config.client_id,
        this.config.client_secret
      );
    }

    // Fall back to DefaultAzureCredential (supports Managed Identity, CLI, etc.)
    return new DefaultAzureCredential();
  }
}

/**
 * Parse Azure Key Vault key URL
 */
export function parseAzureKeyVaultUrl(url: string): {
  vaultUrl: string;
  keyName: string;
  version?: string;
} | null {
  // Format: https://{vault-name}.vault.azure.net/keys/{key-name}/{version}
  const regex = /^(https:\/\/[^/]+\.vault\.azure\.net)\/keys\/([^/]+)(?:\/([^/]+))?$/;
  const match = url.match(regex);

  if (!match) {
    return null;
  }

  return {
    vaultUrl: match[1],
    keyName: match[2],
    version: match[3],
  };
}

/**
 * Build Azure Key Vault key URL
 */
export function buildAzureKeyVaultUrl(params: {
  vaultName: string;
  keyName: string;
  version?: string;
}): string {
  let url = `https://${params.vaultName}.vault.azure.net/keys/${params.keyName}`;

  if (params.version) {
    url += `/${params.version}`;
  }

  return url;
}

/**
 * Validate Azure Key Vault URL format
 */
export function isValidAzureKeyVaultUrl(url: string): boolean {
  const regex = /^https:\/\/[a-zA-Z0-9-]+\.vault\.azure\.net\/keys\/[a-zA-Z0-9-]+(?:\/[a-f0-9]+)?$/;
  return regex.test(url);
}
