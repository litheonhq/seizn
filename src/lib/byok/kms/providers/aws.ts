/**
 * AWS KMS Provider Client
 *
 * Integrates with AWS Key Management Service for BYOK encryption.
 * Supports:
 * - Cross-account access via IAM role assumption
 * - Key rotation
 * - Data key generation
 */

import type {
  KmsProviderClient,
  AwsKmsConfig,
  ValidateKmsResult,
} from '../types';

export class AwsKmsClient implements KmsProviderClient {
  readonly provider = 'aws_kms' as const;
  private config: AwsKmsConfig;
  private keyReference: string;

  constructor(keyReference: string, config: AwsKmsConfig) {
    this.keyReference = keyReference;
    this.config = config;
  }

  /**
   * Validate KMS key access and configuration
   */
  async validate(): Promise<ValidateKmsResult> {
    try {
      // Dynamic import to avoid bundling AWS SDK if not used
      const { KMSClient, DescribeKeyCommand } = await import('@aws-sdk/client-kms');

      const client = this.createClient(KMSClient);
      const command = new DescribeKeyCommand({
        KeyId: this.keyReference,
      });

      const response = await client.send(command);
      const keyMetadata = response.KeyMetadata;

      if (!keyMetadata) {
        return {
          valid: false,
          provider: 'aws_kms',
          key_reference: this.keyReference,
          error: 'Key not found',
        };
      }

      return {
        valid: keyMetadata.Enabled === true,
        provider: 'aws_kms',
        key_reference: this.keyReference,
        key_metadata: {
          key_id: keyMetadata.KeyId || '',
          key_state: keyMetadata.KeyState || 'Unknown',
          creation_date: keyMetadata.CreationDate?.toISOString(),
          description: keyMetadata.Description,
          enabled: keyMetadata.Enabled === true,
          key_spec: keyMetadata.KeySpec,
        },
        error: keyMetadata.Enabled ? undefined : 'Key is not enabled',
      };
    } catch (error) {
      return {
        valid: false,
        provider: 'aws_kms',
        key_reference: this.keyReference,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Wrap a Data Encryption Key (DEK) using the AWS KMS Key Encryption Key (KEK)
   */
  async wrapKey(dek: Buffer): Promise<string> {
    const { KMSClient, EncryptCommand } = await import('@aws-sdk/client-kms');

    const client = this.createClient(KMSClient);
    const command = new EncryptCommand({
      KeyId: this.keyReference,
      Plaintext: dek,
      EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
    });

    const response = await client.send(command);

    if (!response.CiphertextBlob) {
      throw new Error('Failed to wrap key: No ciphertext returned');
    }

    return Buffer.from(response.CiphertextBlob).toString('base64');
  }

  /**
   * Unwrap a Data Encryption Key (DEK)
   */
  async unwrapKey(wrappedKey: string): Promise<Buffer> {
    const { KMSClient, DecryptCommand } = await import('@aws-sdk/client-kms');

    const client = this.createClient(KMSClient);
    const command = new DecryptCommand({
      KeyId: this.keyReference,
      CiphertextBlob: Buffer.from(wrappedKey, 'base64'),
      EncryptionAlgorithm: 'SYMMETRIC_DEFAULT',
    });

    const response = await client.send(command);

    if (!response.Plaintext) {
      throw new Error('Failed to unwrap key: No plaintext returned');
    }

    return Buffer.from(response.Plaintext);
  }

  /**
   * Generate a new Data Encryption Key
   */
  async generateDataKey(): Promise<{ plaintext: Buffer; ciphertext: string }> {
    const { KMSClient, GenerateDataKeyCommand } = await import('@aws-sdk/client-kms');

    const client = this.createClient(KMSClient);
    const command = new GenerateDataKeyCommand({
      KeyId: this.keyReference,
      KeySpec: 'AES_256',
    });

    const response = await client.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('Failed to generate data key');
    }

    return {
      plaintext: Buffer.from(response.Plaintext),
      ciphertext: Buffer.from(response.CiphertextBlob).toString('base64'),
    };
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
   * Note: AWS KMS automatic rotation creates a new backing key but keeps the same key ID
   */
  async rotateKey(): Promise<string> {
    const { KMSClient, EnableKeyRotationCommand } = await import('@aws-sdk/client-kms');

    const client = this.createClient(KMSClient);
    const command = new EnableKeyRotationCommand({
      KeyId: this.keyReference,
    });

    await client.send(command);

    // AWS KMS rotation keeps the same key reference
    return this.keyReference;
  }

  /**
   * Create AWS KMS client with proper credentials
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createClient<T extends new (config: any) => any>(
    ClientClass: T
  ): InstanceType<T> {
    const clientConfig: Record<string, unknown> = {
      region: this.config.region,
    };

    // Use explicit credentials if provided
    if (this.config.access_key_id && this.config.secret_access_key) {
      clientConfig.credentials = {
        accessKeyId: this.config.access_key_id,
        secretAccessKey: this.config.secret_access_key,
      };
    }

    return new ClientClass(clientConfig) as InstanceType<T>;
  }

  /**
   * Assume IAM role for cross-account access
   * Note: This would be used when role_arn is configured
   */
  async assumeRole(): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
  }> {
    if (!this.config.role_arn) {
      throw new Error('Role ARN not configured');
    }

    const { STSClient, AssumeRoleCommand } = await import('@aws-sdk/client-sts');

    const stsClient = new STSClient({ region: this.config.region });
    const command = new AssumeRoleCommand({
      RoleArn: this.config.role_arn,
      RoleSessionName: 'seizn-byok-session',
      ExternalId: this.config.external_id,
      DurationSeconds: 3600, // 1 hour
    });

    const response = await stsClient.send(command);

    if (!response.Credentials) {
      throw new Error('Failed to assume role');
    }

    return {
      accessKeyId: response.Credentials.AccessKeyId || '',
      secretAccessKey: response.Credentials.SecretAccessKey || '',
      sessionToken: response.Credentials.SessionToken || '',
    };
  }
}

/**
 * Parse AWS KMS key ARN
 */
export function parseAwsKmsArn(arn: string): {
  region: string;
  accountId: string;
  keyId: string;
} | null {
  // ARN format: arn:aws:kms:region:account-id:key/key-id
  const arnRegex = /^arn:aws:kms:([a-z0-9-]+):(\d+):key\/([a-f0-9-]+)$/;
  const match = arn.match(arnRegex);

  if (!match) {
    return null;
  }

  return {
    region: match[1],
    accountId: match[2],
    keyId: match[3],
  };
}

/**
 * Validate AWS KMS key reference format
 */
export function isValidAwsKmsKeyReference(keyReference: string): boolean {
  // Accept ARN or key ID
  const arnRegex = /^arn:aws:kms:[a-z0-9-]+:\d+:key\/[a-f0-9-]+$/;
  const keyIdRegex = /^[a-f0-9-]{36}$/;
  const aliasRegex = /^alias\/[a-zA-Z0-9/_-]+$/;

  return arnRegex.test(keyReference) || keyIdRegex.test(keyReference) || aliasRegex.test(keyReference);
}
