/**
 * Data Residency Types
 *
 * Configuration types for multi-region deployment and data residency compliance.
 */

export type DataRegion = 'us' | 'eu' | 'ap';

export type RegionCode =
  | 'us-east-1'    // US East (Virginia)
  | 'us-west-2'    // US West (Oregon)
  | 'eu-west-1'    // EU (Ireland)
  | 'eu-central-1' // EU (Frankfurt)
  | 'ap-northeast-1' // Asia Pacific (Tokyo)
  | 'ap-southeast-1'; // Asia Pacific (Singapore)

export type DeploymentSKU = 'starter' | 'professional' | 'enterprise' | 'dedicated';

export interface RegionConfig {
  code: RegionCode;
  name: string;
  dataRegion: DataRegion;
  available: boolean;
  complianceFrameworks: ComplianceFramework[];
  latencyZone: string;
  provider: CloudProvider;
}

export type CloudProvider = 'aws' | 'gcp' | 'azure' | 'hetzner';

export type ComplianceFramework =
  | 'GDPR'
  | 'CCPA'
  | 'HIPAA'
  | 'SOC2'
  | 'ISO27001'
  | 'PIPL'
  | 'LGPD'
  | 'PDPA';

export interface DataResidencyPolicy {
  id: string;
  organizationId: string;
  primaryRegion: RegionCode;
  allowedRegions: RegionCode[];
  replicationPolicy: ReplicationPolicy;
  complianceRequirements: ComplianceFramework[];
  dataCategories: DataCategory[];
  createdAt: string;
  updatedAt: string;
}

export type ReplicationPolicy =
  | 'single-region'      // Data stays in primary region only
  | 'regional-failover'  // Replicated within same data region
  | 'global-readonly'    // Read replicas globally, writes in primary
  | 'active-active';     // Full multi-region active-active

export interface DataCategory {
  name: string;
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  residencyRequired: boolean;
  retentionDays: number;
  encryptionRequired: boolean;
}

export interface DeploymentConfig {
  sku: DeploymentSKU;
  region: RegionCode;
  highAvailability: boolean;
  dedicatedCompute: boolean;
  customDomain: boolean;
  sla: SLAConfig;
  features: FeatureFlags;
}

export interface SLAConfig {
  uptimeTarget: number;      // e.g., 99.9
  supportResponseHours: number;
  incidentEscalation: boolean;
  dedicatedSupportEngineer: boolean;
}

export interface FeatureFlags {
  multiRegion: boolean;
  customEncryptionKeys: boolean;
  auditLogExport: boolean;
  advancedRBAC: boolean;
  sso: boolean;
  apiRateLimit: number;
  modelAccess: ModelAccessTier;
}

export type ModelAccessTier = 'standard' | 'advanced' | 'enterprise';

// Region endpoint configuration
export interface RegionEndpoint {
  api: string;
  websocket: string;
  storage: string;
  analytics: string;
}

// Data transfer record for compliance
export interface DataTransferRecord {
  id: string;
  sourceRegion: RegionCode;
  destinationRegion: RegionCode;
  dataCategory: string;
  transferType: 'replication' | 'backup' | 'user-request' | 'analytics';
  legalBasis: string;
  timestamp: string;
  sizeBytes: number;
  encrypted: boolean;
}

// SKU definitions
export const SKU_DEFINITIONS: Record<DeploymentSKU, {
  name: string;
  features: Partial<FeatureFlags>;
  regions: DataRegion[];
  priceMonthly: number;
}> = {
  starter: {
    name: 'Starter',
    features: {
      multiRegion: false,
      customEncryptionKeys: false,
      auditLogExport: false,
      advancedRBAC: false,
      sso: false,
      apiRateLimit: 1000,
      modelAccess: 'standard',
    },
    regions: ['us'],
    priceMonthly: 0,
  },
  professional: {
    name: 'Professional',
    features: {
      multiRegion: false,
      customEncryptionKeys: false,
      auditLogExport: true,
      advancedRBAC: true,
      sso: true,
      apiRateLimit: 10000,
      modelAccess: 'advanced',
    },
    regions: ['us', 'eu'],
    priceMonthly: 99,
  },
  enterprise: {
    name: 'Enterprise',
    features: {
      multiRegion: true,
      customEncryptionKeys: true,
      auditLogExport: true,
      advancedRBAC: true,
      sso: true,
      apiRateLimit: 100000,
      modelAccess: 'enterprise',
    },
    regions: ['us', 'eu', 'ap'],
    priceMonthly: 499,
  },
  dedicated: {
    name: 'Dedicated',
    features: {
      multiRegion: true,
      customEncryptionKeys: true,
      auditLogExport: true,
      advancedRBAC: true,
      sso: true,
      apiRateLimit: -1, // Unlimited
      modelAccess: 'enterprise',
    },
    regions: ['us', 'eu', 'ap'],
    priceMonthly: -1, // Custom pricing
  },
};

// Region definitions
export const REGION_DEFINITIONS: Record<RegionCode, RegionConfig> = {
  'us-east-1': {
    code: 'us-east-1',
    name: 'US East (Virginia)',
    dataRegion: 'us',
    available: true,
    complianceFrameworks: ['SOC2', 'CCPA', 'HIPAA'],
    latencyZone: 'americas',
    provider: 'aws',
  },
  'us-west-2': {
    code: 'us-west-2',
    name: 'US West (Oregon)',
    dataRegion: 'us',
    available: true,
    complianceFrameworks: ['SOC2', 'CCPA'],
    latencyZone: 'americas',
    provider: 'aws',
  },
  'eu-west-1': {
    code: 'eu-west-1',
    name: 'EU (Ireland)',
    dataRegion: 'eu',
    available: true,
    complianceFrameworks: ['GDPR', 'SOC2', 'ISO27001'],
    latencyZone: 'europe',
    provider: 'aws',
  },
  'eu-central-1': {
    code: 'eu-central-1',
    name: 'EU (Frankfurt)',
    dataRegion: 'eu',
    available: true,
    complianceFrameworks: ['GDPR', 'SOC2', 'ISO27001'],
    latencyZone: 'europe',
    provider: 'hetzner',
  },
  'ap-northeast-1': {
    code: 'ap-northeast-1',
    name: 'Asia Pacific (Tokyo)',
    dataRegion: 'ap',
    available: false, // Coming soon
    complianceFrameworks: ['SOC2', 'PIPL'],
    latencyZone: 'asia-pacific',
    provider: 'aws',
  },
  'ap-southeast-1': {
    code: 'ap-southeast-1',
    name: 'Asia Pacific (Singapore)',
    dataRegion: 'ap',
    available: false, // Coming soon
    complianceFrameworks: ['SOC2', 'PDPA'],
    latencyZone: 'asia-pacific',
    provider: 'aws',
  },
};

// Helper functions
export function getAvailableRegions(sku: DeploymentSKU): RegionConfig[] {
  const skuDef = SKU_DEFINITIONS[sku];
  return Object.values(REGION_DEFINITIONS).filter(
    (region) => region.available && skuDef.regions.includes(region.dataRegion)
  );
}

export function isRegionCompliant(
  region: RegionCode,
  requirements: ComplianceFramework[]
): boolean {
  const regionConfig = REGION_DEFINITIONS[region];
  return requirements.every((req) =>
    regionConfig.complianceFrameworks.includes(req)
  );
}

export function getRegionEndpoints(region: RegionCode): RegionEndpoint {
  const regionConfig = REGION_DEFINITIONS[region];

  // Domain patterns based on region
  const baseDomain = regionConfig.dataRegion === 'us'
    ? 'seizn.com'
    : `${regionConfig.dataRegion}.seizn.com`;

  return {
    api: `https://api.${baseDomain}`,
    websocket: `wss://ws.${baseDomain}`,
    storage: `https://storage.${baseDomain}`,
    analytics: `https://analytics.${baseDomain}`,
  };
}
