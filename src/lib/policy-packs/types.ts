/**
 * Policy Pack Registry Types
 *
 * TypeScript definitions for signed, versioned governance policy packages.
 */

export type PolicyCategory = 'privacy' | 'retention' | 'security' | 'compliance' | 'custom';
export type PackVisibility = 'public' | 'private' | 'unlisted';
export type VersionStatus = 'draft' | 'published' | 'deprecated' | 'yanked';
export type UpdateChannel = 'stable' | 'latest' | 'pinned';
export type InstallationStatus = 'active' | 'suspended' | 'pending_update';

// ============================================
// Policy Pack
// ============================================

export interface PolicyPack {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  category: PolicyCategory;
  tags: string[];
  publisher: string;
  publisherVerified: boolean;
  visibility: PackVisibility;
  isOfficial: boolean;
  installCount: number;
  starCount: number;
  homepageUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  supportEmail?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackInput {
  name: string;
  displayName: string;
  description?: string;
  iconUrl?: string;
  category: PolicyCategory;
  tags?: string[];
  visibility?: PackVisibility;
  homepageUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  supportEmail?: string;
}

export interface UpdatePackInput {
  displayName?: string;
  description?: string;
  iconUrl?: string;
  tags?: string[];
  visibility?: PackVisibility;
  homepageUrl?: string;
  repositoryUrl?: string;
  documentationUrl?: string;
  supportEmail?: string;
}

// ============================================
// Policy Pack Version
// ============================================

export interface PolicyPackVersion {
  id: string;
  packId: string;
  version: string;
  versionMajor: number;
  versionMinor: number;
  versionPatch: number;
  policies: PolicyDefinition[];
  schemas: Record<string, unknown>;
  examples: unknown[];
  signature?: string;
  contentHash: string;
  signedBy?: string;
  minPlatformVersion?: string;
  maxPlatformVersion?: string;
  dependencies: PackDependency[];
  status: VersionStatus;
  publishedAt?: string;
  deprecatedAt?: string;
  deprecationReason?: string;
  changelog?: string;
  breakingChanges: string[];
  createdAt: string;
}

export interface PolicyDefinition {
  type: string;
  pattern?: string;
  replacement?: string;
  model?: string;
  action?: string;
  config?: Record<string, unknown>;
}

export interface PackDependency {
  packName: string;
  versionRange: string;
}

export interface CreateVersionInput {
  version: string;
  policies: PolicyDefinition[];
  schemas?: Record<string, unknown>;
  examples?: unknown[];
  minPlatformVersion?: string;
  dependencies?: PackDependency[];
  changelog?: string;
  breakingChanges?: string[];
}

// ============================================
// Installation
// ============================================

export interface PackInstallation {
  id: string;
  organizationId: string;
  packId: string;
  versionId: string;
  config: Record<string, unknown>;
  enabled: boolean;
  autoUpdate: boolean;
  updateChannel: UpdateChannel;
  pinnedVersion?: string;
  status: InstallationStatus;
  lastEvaluatedAt?: string;
  evaluationErrors?: unknown[];
  installedBy?: string;
  installedAt: string;
  updatedAt: string;
}

export interface InstallPackInput {
  packName: string;
  version?: string;
  config?: Record<string, unknown>;
  autoUpdate?: boolean;
  updateChannel?: UpdateChannel;
}

export interface UpdateInstallationInput {
  config?: Record<string, unknown>;
  enabled?: boolean;
  autoUpdate?: boolean;
  updateChannel?: UpdateChannel;
  pinnedVersion?: string;
}

// ============================================
// Review
// ============================================

export interface PackReview {
  id: string;
  packId: string;
  userId: string;
  organizationId?: string;
  rating: number;
  title?: string;
  body?: string;
  helpfulCount: number;
  verifiedInstallation: boolean;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewInput {
  packId: string;
  rating: number;
  title?: string;
  body?: string;
}

// ============================================
// Catalog & Search
// ============================================

export interface CatalogEntry {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  category: PolicyCategory;
  tags: string[];
  publisher: string;
  publisherVerified: boolean;
  isOfficial: boolean;
  installCount: number;
  starCount: number;
  latestVersion?: string;
  latestPublishedAt?: string;
  avgRating?: number;
  reviewCount: number;
}

export interface SearchOptions {
  query?: string;
  category?: PolicyCategory;
  official?: boolean;
  minRating?: number;
  sortBy?: 'installs' | 'rating' | 'recent' | 'name';
  limit?: number;
  offset?: number;
}

// ============================================
// Installed Policies (Merged)
// ============================================

export interface InstalledPolicy {
  packId: string;
  packName: string;
  displayName: string;
  category: PolicyCategory;
  version: string;
  policies: PolicyDefinition[];
  config: Record<string, unknown>;
  enabled: boolean;
  installedAt: string;
}
