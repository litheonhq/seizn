/**
 * Seizn Data Residency Regions Configuration
 *
 * Defines supported regions for data residency, including metadata
 * for display, data center locations, and compliance information.
 *
 * IMPORTANT: Region selection affects where user data is stored and processed.
 * Once set, migration to another region requires explicit user consent and
 * may involve data transfer fees.
 */

// ============================================
// Region Types
// ============================================

export type RegionCode =
  | 'us-east'
  | 'us-west'
  | 'eu-west'
  | 'eu-central'
  | 'ap-northeast'
  | 'ap-southeast';

export interface RegionConfig {
  /** Region code (primary key) */
  code: RegionCode;

  /** Display name for UI */
  name: string;

  /** Short description */
  description: string;

  /** Flag emoji for visual identification */
  flag: string;

  /** Primary country/location */
  location: string;

  /** Data center provider info */
  dataCenter: {
    provider: string;
    city: string;
    country: string;
  };

  /** Compliance frameworks applicable to this region */
  compliance: string[];

  /** Whether this region is currently available */
  available: boolean;

  /** Latency tier (1 = lowest latency for most users) */
  latencyTier: 1 | 2 | 3;

  /** Plans that can use this region */
  availableForPlans: ('free' | 'starter' | 'plus' | 'pro' | 'enterprise')[];
}

// ============================================
// Region Configuration
// ============================================

export const REGIONS: Record<RegionCode, RegionConfig> = {
  'us-east': {
    code: 'us-east',
    name: 'US East (Virginia)',
    description: 'Primary US region with lowest latency for North American users',
    flag: '🇺🇸',
    location: 'Virginia, USA',
    dataCenter: {
      provider: 'AWS / Neon',
      city: 'Ashburn',
      country: 'United States',
    },
    compliance: ['SOC 2', 'HIPAA', 'CCPA'],
    available: true,
    latencyTier: 1,
    availableForPlans: ['free', 'starter', 'plus', 'pro', 'enterprise'],
  },

  'us-west': {
    code: 'us-west',
    name: 'US West (Oregon)',
    description: 'West coast US region for Pacific time zone optimization',
    flag: '🇺🇸',
    location: 'Oregon, USA',
    dataCenter: {
      provider: 'AWS / Neon',
      city: 'Portland',
      country: 'United States',
    },
    compliance: ['SOC 2', 'HIPAA', 'CCPA'],
    available: false, // Coming soon
    latencyTier: 2,
    availableForPlans: ['plus', 'pro', 'enterprise'],
  },

  'eu-west': {
    code: 'eu-west',
    name: 'EU West (Ireland)',
    description: 'Primary EU region with GDPR compliance',
    flag: '🇪🇺',
    location: 'Dublin, Ireland',
    dataCenter: {
      provider: 'AWS / Neon',
      city: 'Dublin',
      country: 'Ireland',
    },
    compliance: ['GDPR', 'SOC 2', 'ISO 27001'],
    available: true,
    latencyTier: 1,
    availableForPlans: ['free', 'starter', 'plus', 'pro', 'enterprise'],
  },

  'eu-central': {
    code: 'eu-central',
    name: 'EU Central (Frankfurt)',
    description: 'Central European region with strict German data protection',
    flag: '🇩🇪',
    location: 'Frankfurt, Germany',
    dataCenter: {
      provider: 'AWS / Neon',
      city: 'Frankfurt',
      country: 'Germany',
    },
    compliance: ['GDPR', 'SOC 2', 'ISO 27001', 'BSI C5'],
    available: false, // Coming soon
    latencyTier: 2,
    availableForPlans: ['pro', 'enterprise'],
  },

  'ap-northeast': {
    code: 'ap-northeast',
    name: 'Asia Pacific (Tokyo)',
    description: 'Primary APAC region for Japan, Korea, and East Asia',
    flag: '🇯🇵',
    location: 'Tokyo, Japan',
    dataCenter: {
      provider: 'AWS / Neon',
      city: 'Tokyo',
      country: 'Japan',
    },
    compliance: ['SOC 2', 'APPI', 'ISO 27001'],
    available: true,
    latencyTier: 1,
    availableForPlans: ['free', 'starter', 'plus', 'pro', 'enterprise'],
  },

  'ap-southeast': {
    code: 'ap-southeast',
    name: 'Asia Pacific (Singapore)',
    description: 'Southeast Asia region for ASEAN countries',
    flag: '🇸🇬',
    location: 'Singapore',
    dataCenter: {
      provider: 'AWS / Neon',
      city: 'Singapore',
      country: 'Singapore',
    },
    compliance: ['SOC 2', 'PDPA', 'ISO 27001'],
    available: false, // Coming soon
    latencyTier: 2,
    availableForPlans: ['plus', 'pro', 'enterprise'],
  },
};

// ============================================
// Default Region
// ============================================

/** Default region for new organizations */
export const DEFAULT_REGION: RegionCode = 'us-east';

/** Recommended region based on locale */
export const LOCALE_REGION_MAP: Record<string, RegionCode> = {
  'en': 'us-east',
  'en-US': 'us-east',
  'en-GB': 'eu-west',
  'de': 'eu-west',
  'de-DE': 'eu-west',
  'fr': 'eu-west',
  'fr-FR': 'eu-west',
  'ja': 'ap-northeast',
  'ja-JP': 'ap-northeast',
  'ko': 'ap-northeast',
  'ko-KR': 'ap-northeast',
  'zh': 'ap-northeast',
  'zh-CN': 'ap-northeast',
  'zh-TW': 'ap-northeast',
};

// ============================================
// Region Utilities
// ============================================

/**
 * Get region configuration by code
 */
export function getRegion(code: RegionCode | string): RegionConfig | null {
  return REGIONS[code as RegionCode] || null;
}

/**
 * Get all available regions
 */
export function getAvailableRegions(): RegionConfig[] {
  return Object.values(REGIONS).filter((r) => r.available);
}

/**
 * Get regions available for a specific plan
 */
export function getRegionsForPlan(
  plan: 'free' | 'starter' | 'plus' | 'pro' | 'enterprise'
): RegionConfig[] {
  return Object.values(REGIONS).filter(
    (r) => r.available && r.availableForPlans.includes(plan)
  );
}

/**
 * Check if a region is available for a specific plan
 */
export function isRegionAvailableForPlan(
  regionCode: RegionCode | string,
  plan: 'free' | 'starter' | 'plus' | 'pro' | 'enterprise'
): boolean {
  const region = getRegion(regionCode);
  if (!region) return false;
  return region.available && region.availableForPlans.includes(plan);
}

/**
 * Get recommended region based on locale
 */
export function getRecommendedRegion(locale?: string): RegionCode {
  if (!locale) return DEFAULT_REGION;

  // Try exact match first
  if (LOCALE_REGION_MAP[locale]) {
    return LOCALE_REGION_MAP[locale];
  }

  // Try language code only (e.g., 'en' from 'en-US')
  const langCode = locale.split('-')[0];
  if (LOCALE_REGION_MAP[langCode]) {
    return LOCALE_REGION_MAP[langCode];
  }

  return DEFAULT_REGION;
}

/**
 * Validate region code
 */
export function isValidRegionCode(code: string): code is RegionCode {
  return code in REGIONS;
}

/**
 * Get region display string (flag + name)
 */
export function getRegionDisplayName(code: RegionCode | string): string {
  const region = getRegion(code);
  if (!region) return code;
  return `${region.flag} ${region.name}`;
}

/**
 * Get compliance info for a region
 */
export function getRegionCompliance(code: RegionCode | string): string[] {
  const region = getRegion(code);
  return region?.compliance || [];
}

// ============================================
// Data Residency Implications
// ============================================

export interface DataResidencyInfo {
  /** Where data is stored */
  storageLocation: string;

  /** Where data is processed */
  processingLocation: string;

  /** Applicable laws */
  applicableLaws: string[];

  /** Data transfer notes */
  transferNotes: string;
}

/**
 * Get data residency information for a region
 */
export function getDataResidencyInfo(code: RegionCode | string): DataResidencyInfo | null {
  const region = getRegion(code);
  if (!region) return null;

  const residencyInfo: Record<RegionCode, DataResidencyInfo> = {
    'us-east': {
      storageLocation: 'United States (Virginia)',
      processingLocation: 'United States',
      applicableLaws: ['US Federal Law', 'Virginia CDPA', 'CCPA (for CA residents)'],
      transferNotes: 'Data may be accessed from other US regions for redundancy.',
    },
    'us-west': {
      storageLocation: 'United States (Oregon)',
      processingLocation: 'United States',
      applicableLaws: ['US Federal Law', 'Oregon Consumer Privacy Act', 'CCPA'],
      transferNotes: 'Data may be accessed from other US regions for redundancy.',
    },
    'eu-west': {
      storageLocation: 'European Union (Ireland)',
      processingLocation: 'European Union',
      applicableLaws: ['GDPR', 'Irish Data Protection Act 2018'],
      transferNotes: 'Data remains within the EU. No transfer to third countries without consent.',
    },
    'eu-central': {
      storageLocation: 'European Union (Germany)',
      processingLocation: 'European Union',
      applicableLaws: ['GDPR', 'BDSG (German Federal Data Protection Act)'],
      transferNotes: 'Data remains within the EU. Subject to strict German data protection standards.',
    },
    'ap-northeast': {
      storageLocation: 'Japan (Tokyo)',
      processingLocation: 'Japan',
      applicableLaws: ['APPI (Act on Protection of Personal Information)', 'Japanese Data Privacy Laws'],
      transferNotes: 'Data processed in Japan. APPI adequacy decision with EU allows data flow.',
    },
    'ap-southeast': {
      storageLocation: 'Singapore',
      processingLocation: 'Singapore',
      applicableLaws: ['PDPA (Personal Data Protection Act)', 'Singapore Data Protection Laws'],
      transferNotes: 'Data processed in Singapore. Strong data protection framework.',
    },
  };

  return residencyInfo[code as RegionCode] || null;
}

// ============================================
// Region Migration
// ============================================

export interface RegionMigrationInfo {
  /** Estimated time for migration */
  estimatedDuration: string;

  /** Data transfer size considerations */
  transferConsiderations: string;

  /** Downtime expected */
  expectedDowntime: string;

  /** Steps required */
  steps: string[];
}

/**
 * Get information about migrating between regions
 */
export function getRegionMigrationInfo(
  fromRegion: RegionCode,
  toRegion: RegionCode
): RegionMigrationInfo {
  // Cross-continental migrations take longer
  const isCrossContinental =
    (fromRegion.startsWith('us') && !toRegion.startsWith('us')) ||
    (fromRegion.startsWith('eu') && !toRegion.startsWith('eu')) ||
    (fromRegion.startsWith('ap') && !toRegion.startsWith('ap'));

  return {
    estimatedDuration: isCrossContinental ? '24-48 hours' : '4-8 hours',
    transferConsiderations: isCrossContinental
      ? 'Cross-continental transfer may incur additional latency during migration.'
      : 'Same-continent transfer should be relatively quick.',
    expectedDowntime: '< 5 minutes (during final switchover)',
    steps: [
      'Request region migration from organization settings',
      'Confirm understanding of data residency implications',
      'Schedule migration window (Enterprise: custom, others: automatic)',
      'Data is replicated to new region',
      'DNS and routing updated',
      'Verification and cleanup',
    ],
  };
}
