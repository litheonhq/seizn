/**
 * BYOK KMS Configuration API
 *
 * GET    /api/byok/kms - List KMS configurations
 * POST   /api/byok/kms - Create KMS configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseUserFromBearer } from '@/lib/api/request-user';
import {
  listKmsConfigs,
  createKmsConfig,
  getProviderDisplayName,
  type KmsProvider,
  type ProviderConfig,
} from '@/lib/byok/kms';
import { getUserOrgRole } from '@/lib/winter/org';
import { parsePagination } from '@/lib/parse-params';
import {
  isValidAwsKmsKeyReference,
  isValidGcpKmsKeyReference,
  isValidAzureKeyVaultUrl,
} from '@/lib/byok/kms';


/**
 * GET /api/byok/kms
 * List KMS configurations for an organization
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
    }

    // Check user has access to org
    const role = await getUserOrgRole(orgId, user.id);
    if (!role) {
      return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
    }

    const provider = searchParams.get('provider') as KmsProvider | undefined;
    const isActive = searchParams.get('is_active');
    const { limit, offset } = parsePagination(searchParams, { limit: 50 });

    const configs = await listKmsConfigs({
      organization_id: orgId,
      provider,
      is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      limit,
      offset,
    });

    // Redact sensitive fields
    const safeConfigs = configs.data.map(config => ({
      ...config,
      provider_config_encrypted: undefined, // Never expose
      provider_display_name: getProviderDisplayName(config.provider),
    }));

    return NextResponse.json({
      success: true,
      configs: safeConfigs,
      total: configs.total,
      limit: configs.limit,
      offset: configs.offset,
      has_more: configs.has_more,
    });
  } catch (error) {
    console.error('[BYOK KMS] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/byok/kms
 * Create a new KMS configuration
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSupabaseUserFromBearer(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      organization_id,
      provider,
      name,
      description,
      key_reference,
      provider_config,
      key_algorithm,
      key_usage,
      rotation_enabled,
      rotation_interval_days,
      is_default,
    } = body;

    // Validate required fields
    if (!organization_id) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    if (!provider) {
      return NextResponse.json({ error: 'provider is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    if (!key_reference) {
      return NextResponse.json({ error: 'key_reference is required' }, { status: 400 });
    }

    if (!provider_config) {
      return NextResponse.json({ error: 'provider_config is required' }, { status: 400 });
    }

    // Check user is admin or owner
    const role = await getUserOrgRole(organization_id, user.id);
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Not authorized to manage KMS configurations' }, { status: 403 });
    }

    // Validate provider
    const validProviders: KmsProvider[] = ['aws_kms', 'gcp_kms', 'azure_keyvault'];
    if (!validProviders.includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Validate key reference format based on provider
    let isValidKeyReference = false;
    switch (provider) {
      case 'aws_kms':
        isValidKeyReference = isValidAwsKmsKeyReference(key_reference);
        break;
      case 'gcp_kms':
        isValidKeyReference = isValidGcpKmsKeyReference(key_reference);
        break;
      case 'azure_keyvault':
        isValidKeyReference = isValidAzureKeyVaultUrl(key_reference);
        break;
    }

    if (!isValidKeyReference) {
      return NextResponse.json({
        error: `Invalid key reference format for ${provider}`,
        details: getKeyReferenceExample(provider),
      }, { status: 400 });
    }

    // Validate provider config
    const configValidation = validateProviderConfig(provider, provider_config);
    if (!configValidation.valid) {
      return NextResponse.json({
        error: 'Invalid provider configuration',
        details: configValidation.errors,
      }, { status: 400 });
    }

    // Create KMS config
    const config = await createKmsConfig({
      organization_id,
      provider,
      name,
      description,
      key_reference,
      provider_config: provider_config as ProviderConfig,
      key_algorithm: key_algorithm || 'AES_256',
      key_usage: key_usage || 'ENCRYPT_DECRYPT',
      rotation_enabled: rotation_enabled || false,
      rotation_interval_days: rotation_interval_days || 90,
      is_default: is_default || false,
      created_by: user.id,
    });

    return NextResponse.json({
      success: true,
      config: {
        ...config,
        provider_config_encrypted: undefined,
        provider_display_name: getProviderDisplayName(config.provider),
      },
    });
  } catch (error) {
    console.error('[BYOK KMS] POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================
// Helper Functions
// ============================================

function getKeyReferenceExample(provider: KmsProvider): string {
  switch (provider) {
    case 'aws_kms':
      return 'AWS KMS: arn:aws:kms:region:account-id:key/key-id or key alias';
    case 'gcp_kms':
      return 'GCP KMS: projects/project-id/locations/location/keyRings/keyring/cryptoKeys/key';
    case 'azure_keyvault':
      return 'Azure: https://vault-name.vault.azure.net/keys/key-name/version';
    default:
      return '';
  }
}

function validateProviderConfig(
  provider: KmsProvider,
  config: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (provider) {
    case 'aws_kms':
      if (!config.region) {
        errors.push('region is required for AWS KMS');
      }
      break;

    case 'gcp_kms':
      if (!config.project_id) {
        errors.push('project_id is required for GCP KMS');
      }
      if (!config.location) {
        errors.push('location is required for GCP KMS');
      }
      break;

    case 'azure_keyvault':
      if (!config.vault_url) {
        errors.push('vault_url is required for Azure Key Vault');
      }
      if (!config.tenant_id) {
        errors.push('tenant_id is required for Azure Key Vault');
      }
      if (!config.client_id && !config.use_managed_identity) {
        errors.push('client_id is required for Azure Key Vault (unless using managed identity)');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
