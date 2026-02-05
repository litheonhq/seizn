/**
 * KMS Signer for Evidence Packs
 *
 * Integrates with cloud KMS providers for cryptographic signing:
 * - AWS KMS
 * - Azure Key Vault
 * - Google Cloud KMS
 *
 * @module provenance/kms-signer
 */

import { KMSClient, SignCommand, VerifyCommand, GetPublicKeyCommand, SigningAlgorithmSpec } from '@aws-sdk/client-kms';
import { KeyClient, CryptographyClient } from '@azure/keyvault-keys';
import { DefaultAzureCredential } from '@azure/identity';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { createHash } from 'crypto';

// ============================================
// Types
// ============================================

export type KMSProvider = 'aws' | 'azure' | 'gcp' | 'local';

export interface KMSConfig {
  provider: KMSProvider;
  aws?: {
    region: string;
    keyId: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  azure?: {
    keyVaultUrl: string;
    keyName: string;
    keyVersion?: string;
  };
  gcp?: {
    projectId: string;
    locationId: string;
    keyRingId: string;
    keyId: string;
    keyVersion?: string;
  };
}

export interface SignatureResult {
  algorithm: string;
  signature: string;
  keyId: string;
  provider: KMSProvider;
  timestamp: string;
}

export interface VerificationResult {
  valid: boolean;
  keyId: string;
  provider: KMSProvider;
  error?: string;
}

// ============================================
// KMS Signer Interface
// ============================================

export interface IKMSSigner {
  sign(data: string | Buffer): Promise<SignatureResult>;
  verify(data: string | Buffer, signature: string): Promise<VerificationResult>;
  getPublicKey(): Promise<string>;
}

// ============================================
// AWS KMS Signer
// ============================================

export class AWSKMSSigner implements IKMSSigner {
  private client: KMSClient;
  private keyId: string;

  constructor(config: NonNullable<KMSConfig['aws']>) {
    this.keyId = config.keyId;
    this.client = new KMSClient({
      region: config.region,
      credentials: config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
    });
  }

  async sign(data: string | Buffer): Promise<SignatureResult> {
    const digest = createHash('sha256')
      .update(typeof data === 'string' ? data : data)
      .digest();

    const command = new SignCommand({
      KeyId: this.keyId,
      Message: digest,
      MessageType: 'DIGEST',
      SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_256,
    });

    const response = await this.client.send(command);

    if (!response.Signature) {
      throw new Error('Failed to sign data with AWS KMS');
    }

    return {
      algorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
      signature: Buffer.from(response.Signature).toString('base64'),
      keyId: this.keyId,
      provider: 'aws',
      timestamp: new Date().toISOString(),
    };
  }

  async verify(data: string | Buffer, signature: string): Promise<VerificationResult> {
    try {
      const digest = createHash('sha256')
        .update(typeof data === 'string' ? data : data)
        .digest();

      const command = new VerifyCommand({
        KeyId: this.keyId,
        Message: digest,
        MessageType: 'DIGEST',
        Signature: Buffer.from(signature, 'base64'),
        SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PKCS1_V1_5_SHA_256,
      });

      const response = await this.client.send(command);

      return {
        valid: response.SignatureValid ?? false,
        keyId: this.keyId,
        provider: 'aws',
      };
    } catch (error) {
      return {
        valid: false,
        keyId: this.keyId,
        provider: 'aws',
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  async getPublicKey(): Promise<string> {
    const command = new GetPublicKeyCommand({
      KeyId: this.keyId,
    });

    const response = await this.client.send(command);

    if (!response.PublicKey) {
      throw new Error('Failed to get public key from AWS KMS');
    }

    // Convert to PEM format
    const base64Key = Buffer.from(response.PublicKey).toString('base64');
    const pemKey = [
      '-----BEGIN PUBLIC KEY-----',
      ...base64Key.match(/.{1,64}/g) || [],
      '-----END PUBLIC KEY-----',
    ].join('\n');

    return pemKey;
  }
}

// ============================================
// Azure Key Vault Signer
// ============================================

export class AzureKMSSigner implements IKMSSigner {
  private client: KeyClient;
  private keyName: string;
  private keyVersion?: string;
  private keyVaultUrl: string;
  private cryptoClient?: CryptographyClient;

  constructor(config: NonNullable<KMSConfig['azure']>) {
    this.keyVaultUrl = config.keyVaultUrl;
    this.keyName = config.keyName;
    this.keyVersion = config.keyVersion;

    const credential = new DefaultAzureCredential();
    this.client = new KeyClient(config.keyVaultUrl, credential);
  }

  private async getCryptoClient(): Promise<CryptographyClient> {
    if (!this.cryptoClient) {
      const key = await this.client.getKey(this.keyName, { version: this.keyVersion });
      if (!key.id) {
        throw new Error('Key ID not found');
      }
      this.cryptoClient = new CryptographyClient(key.id, new DefaultAzureCredential());
    }
    return this.cryptoClient;
  }

  async sign(data: string | Buffer): Promise<SignatureResult> {
    const cryptoClient = await this.getCryptoClient();

    const digest = createHash('sha256')
      .update(typeof data === 'string' ? data : data)
      .digest();

    const result = await cryptoClient.sign('RS256', digest);

    return {
      algorithm: 'RS256',
      signature: Buffer.from(result.result).toString('base64'),
      keyId: `${this.keyVaultUrl}/keys/${this.keyName}`,
      provider: 'azure',
      timestamp: new Date().toISOString(),
    };
  }

  async verify(data: string | Buffer, signature: string): Promise<VerificationResult> {
    try {
      const cryptoClient = await this.getCryptoClient();

      const digest = createHash('sha256')
        .update(typeof data === 'string' ? data : data)
        .digest();

      const result = await cryptoClient.verify('RS256', digest, Buffer.from(signature, 'base64'));

      return {
        valid: result.result,
        keyId: `${this.keyVaultUrl}/keys/${this.keyName}`,
        provider: 'azure',
      };
    } catch (error) {
      return {
        valid: false,
        keyId: `${this.keyVaultUrl}/keys/${this.keyName}`,
        provider: 'azure',
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  async getPublicKey(): Promise<string> {
    const key = await this.client.getKey(this.keyName, { version: this.keyVersion });

    if (!key.key) {
      throw new Error('Failed to get public key from Azure Key Vault');
    }

    // Convert JWK to PEM (simplified - in production, use a proper JWK to PEM converter)
    const jwk = {
      kty: key.key.kty,
      n: key.key.n ? Buffer.from(key.key.n).toString('base64url') : undefined,
      e: key.key.e ? Buffer.from(key.key.e).toString('base64url') : undefined,
    };

    return JSON.stringify(jwk);
  }
}

// ============================================
// Google Cloud KMS Signer
// ============================================

export class GCPKMSSigner implements IKMSSigner {
  private client: KeyManagementServiceClient;
  private keyVersionPath: string;

  constructor(config: NonNullable<KMSConfig['gcp']>) {
    this.client = new KeyManagementServiceClient();
    this.keyVersionPath = this.client.cryptoKeyVersionPath(
      config.projectId,
      config.locationId,
      config.keyRingId,
      config.keyId,
      config.keyVersion || '1'
    );
  }

  async sign(data: string | Buffer): Promise<SignatureResult> {
    const digest = createHash('sha256')
      .update(typeof data === 'string' ? data : data)
      .digest();

    const [response] = await this.client.asymmetricSign({
      name: this.keyVersionPath,
      digest: { sha256: digest },
    });

    if (!response.signature) {
      throw new Error('Failed to sign data with GCP KMS');
    }

    return {
      algorithm: 'RSA_SIGN_PKCS1_2048_SHA256',
      signature: Buffer.from(response.signature).toString('base64'),
      keyId: this.keyVersionPath,
      provider: 'gcp',
      timestamp: new Date().toISOString(),
    };
  }

  async verify(data: string | Buffer, signature: string): Promise<VerificationResult> {
    try {
      const digest = createHash('sha256')
        .update(typeof data === 'string' ? data : data)
        .digest();

      // Google Cloud KMS asymmetricVerify - use type assertion as the method exists at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [response] = await (this.client as any).asymmetricVerify({
        name: this.keyVersionPath,
        digest: { sha256: digest },
        signature: Buffer.from(signature, 'base64'),
      });

      return {
        valid: response?.success ?? false,
        keyId: this.keyVersionPath,
        provider: 'gcp',
      };
    } catch (error) {
      return {
        valid: false,
        keyId: this.keyVersionPath,
        provider: 'gcp',
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  async getPublicKey(): Promise<string> {
    const [publicKey] = await this.client.getPublicKey({
      name: this.keyVersionPath,
    });

    if (!publicKey.pem) {
      throw new Error('Failed to get public key from GCP KMS');
    }

    return publicKey.pem;
  }
}

// ============================================
// Local Signer (for development/testing)
// ============================================

import { createSign, createVerify, generateKeyPairSync, KeyPairSyncResult } from 'crypto';

export class LocalKMSSigner implements IKMSSigner {
  private keyPair: KeyPairSyncResult<string, string>;
  private keyId: string;

  constructor() {
    this.keyId = `local:${crypto.randomUUID()}`;
    this.keyPair = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  }

  async sign(data: string | Buffer): Promise<SignatureResult> {
    const sign = createSign('SHA256');
    sign.update(data);
    sign.end();
    const signature = sign.sign(this.keyPair.privateKey, 'base64');

    return {
      algorithm: 'RSA-SHA256',
      signature,
      keyId: this.keyId,
      provider: 'local',
      timestamp: new Date().toISOString(),
    };
  }

  async verify(data: string | Buffer, signature: string): Promise<VerificationResult> {
    try {
      const verify = createVerify('SHA256');
      verify.update(data);
      verify.end();
      const isValid = verify.verify(this.keyPair.publicKey, signature, 'base64');

      return {
        valid: isValid,
        keyId: this.keyId,
        provider: 'local',
      };
    } catch (error) {
      return {
        valid: false,
        keyId: this.keyId,
        provider: 'local',
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  async getPublicKey(): Promise<string> {
    return this.keyPair.publicKey;
  }
}

// ============================================
// Factory Function
// ============================================

export function createKMSSigner(config: KMSConfig): IKMSSigner {
  switch (config.provider) {
    case 'aws':
      if (!config.aws) {
        throw new Error('AWS KMS configuration required');
      }
      return new AWSKMSSigner(config.aws);

    case 'azure':
      if (!config.azure) {
        throw new Error('Azure Key Vault configuration required');
      }
      return new AzureKMSSigner(config.azure);

    case 'gcp':
      if (!config.gcp) {
        throw new Error('GCP KMS configuration required');
      }
      return new GCPKMSSigner(config.gcp);

    case 'local':
    default:
      return new LocalKMSSigner();
  }
}

// ============================================
// KMS Config from Environment
// ============================================

export function getKMSConfigFromEnv(): KMSConfig {
  const provider = (process.env.KMS_PROVIDER || 'local') as KMSProvider;

  switch (provider) {
    case 'aws':
      return {
        provider: 'aws',
        aws: {
          region: process.env.AWS_KMS_REGION || process.env.AWS_REGION || 'us-east-1',
          keyId: process.env.AWS_KMS_KEY_ID || '',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      };

    case 'azure':
      return {
        provider: 'azure',
        azure: {
          keyVaultUrl: process.env.AZURE_KEY_VAULT_URL || '',
          keyName: process.env.AZURE_KEY_NAME || '',
          keyVersion: process.env.AZURE_KEY_VERSION,
        },
      };

    case 'gcp':
      return {
        provider: 'gcp',
        gcp: {
          projectId: process.env.GCP_PROJECT_ID || '',
          locationId: process.env.GCP_KMS_LOCATION || 'global',
          keyRingId: process.env.GCP_KMS_KEY_RING || '',
          keyId: process.env.GCP_KMS_KEY_ID || '',
          keyVersion: process.env.GCP_KMS_KEY_VERSION,
        },
      };

    default:
      return { provider: 'local' };
  }
}
