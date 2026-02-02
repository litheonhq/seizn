/**
 * Policy Pack Registry Service
 *
 * Service layer for policy pack management.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type {
  PolicyPack,
  PolicyPackVersion,
  PackInstallation,
  PackReview,
  CatalogEntry,
  CreatePackInput,
  UpdatePackInput,
  CreateVersionInput,
  InstallPackInput,
  UpdateInstallationInput,
  CreateReviewInput,
  SearchOptions,
  InstalledPolicy,
} from './types';

// ============================================
// Version Parsing
// ============================================

function parseVersion(version: string): { major: number; minor: number; patch: number } {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major: major || 0, minor: minor || 0, patch: patch || 0 };
}

function hashPolicies(policies: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(policies)).digest('hex');
}

// ============================================
// Database Mapping
// ============================================

function mapPackFromDb(row: Record<string, unknown>): PolicyPack {
  return {
    id: row.id as string,
    name: row.name as string,
    displayName: row.display_name as string,
    description: row.description as string | undefined,
    iconUrl: row.icon_url as string | undefined,
    category: row.category as PolicyPack['category'],
    tags: row.tags as string[],
    publisher: row.publisher as string,
    publisherVerified: row.publisher_verified as boolean,
    visibility: row.visibility as PolicyPack['visibility'],
    isOfficial: row.is_official as boolean,
    installCount: row.install_count as number,
    starCount: row.star_count as number,
    homepageUrl: row.homepage_url as string | undefined,
    repositoryUrl: row.repository_url as string | undefined,
    documentationUrl: row.documentation_url as string | undefined,
    supportEmail: row.support_email as string | undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapVersionFromDb(row: Record<string, unknown>): PolicyPackVersion {
  return {
    id: row.id as string,
    packId: row.pack_id as string,
    version: row.version as string,
    versionMajor: row.version_major as number,
    versionMinor: row.version_minor as number,
    versionPatch: row.version_patch as number,
    policies: (row.policies as Record<string, unknown>)?.rules as PolicyPackVersion['policies'] || [],
    schemas: row.schemas as Record<string, unknown>,
    examples: row.examples as unknown[],
    signature: row.signature as string | undefined,
    contentHash: row.content_hash as string,
    signedBy: row.signed_by as string | undefined,
    minPlatformVersion: row.min_platform_version as string | undefined,
    maxPlatformVersion: row.max_platform_version as string | undefined,
    dependencies: row.dependencies as PolicyPackVersion['dependencies'],
    status: row.status as PolicyPackVersion['status'],
    publishedAt: row.published_at as string | undefined,
    deprecatedAt: row.deprecated_at as string | undefined,
    deprecationReason: row.deprecation_reason as string | undefined,
    changelog: row.changelog as string | undefined,
    breakingChanges: row.breaking_changes as string[],
    createdAt: row.created_at as string,
  };
}

function mapInstallationFromDb(row: Record<string, unknown>): PackInstallation {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    packId: row.pack_id as string,
    versionId: row.version_id as string,
    config: row.config as Record<string, unknown>,
    enabled: row.enabled as boolean,
    autoUpdate: row.auto_update as boolean,
    updateChannel: row.update_channel as PackInstallation['updateChannel'],
    pinnedVersion: row.pinned_version as string | undefined,
    status: row.status as PackInstallation['status'],
    lastEvaluatedAt: row.last_evaluated_at as string | undefined,
    evaluationErrors: row.evaluation_errors as unknown[] | undefined,
    installedBy: row.installed_by as string | undefined,
    installedAt: row.installed_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ============================================
// Policy Pack Service
// ============================================

export class PolicyPackService {
  constructor(private supabase: SupabaseClient) {}

  // ============================================
  // Pack Management
  // ============================================

  async getPack(packId: string): Promise<PolicyPack | null> {
    const { data, error } = await this.supabase
      .from('policy_packs')
      .select('*')
      .eq('id', packId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapPackFromDb(data);
  }

  async getPackByName(name: string): Promise<PolicyPack | null> {
    const { data, error } = await this.supabase
      .from('policy_packs')
      .select('*')
      .eq('name', name)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapPackFromDb(data);
  }

  async createPack(input: CreatePackInput, publisher: string): Promise<PolicyPack> {
    const { data, error } = await this.supabase
      .from('policy_packs')
      .insert({
        name: input.name,
        display_name: input.displayName,
        description: input.description,
        icon_url: input.iconUrl,
        category: input.category,
        tags: input.tags || [],
        publisher,
        publisher_verified: false,
        visibility: input.visibility || 'private',
        homepage_url: input.homepageUrl,
        repository_url: input.repositoryUrl,
        documentation_url: input.documentationUrl,
        support_email: input.supportEmail,
      })
      .select()
      .single();

    if (error) throw error;
    return mapPackFromDb(data);
  }

  async updatePack(packId: string, input: UpdatePackInput): Promise<PolicyPack> {
    const updates: Record<string, unknown> = {};
    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.description !== undefined) updates.description = input.description;
    if (input.iconUrl !== undefined) updates.icon_url = input.iconUrl;
    if (input.tags !== undefined) updates.tags = input.tags;
    if (input.visibility !== undefined) updates.visibility = input.visibility;
    if (input.homepageUrl !== undefined) updates.homepage_url = input.homepageUrl;
    if (input.repositoryUrl !== undefined) updates.repository_url = input.repositoryUrl;
    if (input.documentationUrl !== undefined) updates.documentation_url = input.documentationUrl;
    if (input.supportEmail !== undefined) updates.support_email = input.supportEmail;

    const { data, error } = await this.supabase
      .from('policy_packs')
      .update(updates)
      .eq('id', packId)
      .select()
      .single();

    if (error) throw error;
    return mapPackFromDb(data);
  }

  // ============================================
  // Version Management
  // ============================================

  async listVersions(packId: string): Promise<PolicyPackVersion[]> {
    const { data, error } = await this.supabase
      .from('policy_pack_versions')
      .select('*')
      .eq('pack_id', packId)
      .order('version_major', { ascending: false })
      .order('version_minor', { ascending: false })
      .order('version_patch', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapVersionFromDb);
  }

  async getVersion(versionId: string): Promise<PolicyPackVersion | null> {
    const { data, error } = await this.supabase
      .from('policy_pack_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapVersionFromDb(data);
  }

  async getLatestVersion(packId: string): Promise<PolicyPackVersion | null> {
    const { data, error } = await this.supabase
      .from('policy_pack_versions')
      .select('*')
      .eq('pack_id', packId)
      .eq('status', 'published')
      .order('version_major', { ascending: false })
      .order('version_minor', { ascending: false })
      .order('version_patch', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapVersionFromDb(data);
  }

  async createVersion(packId: string, input: CreateVersionInput): Promise<PolicyPackVersion> {
    const { major, minor, patch } = parseVersion(input.version);
    const contentHash = hashPolicies(input.policies);

    const { data, error } = await this.supabase
      .from('policy_pack_versions')
      .insert({
        pack_id: packId,
        version: input.version,
        version_major: major,
        version_minor: minor,
        version_patch: patch,
        policies: { rules: input.policies },
        schemas: input.schemas || {},
        examples: input.examples || [],
        content_hash: contentHash,
        min_platform_version: input.minPlatformVersion,
        dependencies: input.dependencies || [],
        changelog: input.changelog,
        breaking_changes: input.breakingChanges || [],
        status: 'draft',
      })
      .select()
      .single();

    if (error) throw error;
    return mapVersionFromDb(data);
  }

  async publishVersion(versionId: string): Promise<PolicyPackVersion> {
    const { data, error } = await this.supabase
      .from('policy_pack_versions')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .eq('id', versionId)
      .select()
      .single();

    if (error) throw error;
    return mapVersionFromDb(data);
  }

  async deprecateVersion(versionId: string, reason: string): Promise<PolicyPackVersion> {
    const { data, error } = await this.supabase
      .from('policy_pack_versions')
      .update({
        status: 'deprecated',
        deprecated_at: new Date().toISOString(),
        deprecation_reason: reason,
      })
      .eq('id', versionId)
      .select()
      .single();

    if (error) throw error;
    return mapVersionFromDb(data);
  }

  // ============================================
  // Installation Management
  // ============================================

  async listInstallations(organizationId: string): Promise<PackInstallation[]> {
    const { data, error } = await this.supabase
      .from('policy_pack_installations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('installed_at', { ascending: false });

    if (error) throw error;
    return (data || []).map(mapInstallationFromDb);
  }

  async getInstallation(installationId: string): Promise<PackInstallation | null> {
    const { data, error } = await this.supabase
      .from('policy_pack_installations')
      .select('*')
      .eq('id', installationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    return mapInstallationFromDb(data);
  }

  async installPack(
    organizationId: string,
    input: InstallPackInput
  ): Promise<PackInstallation> {
    const { data, error } = await this.supabase.rpc('install_policy_pack', {
      p_organization_id: organizationId,
      p_pack_name: input.packName,
      p_version: input.version || null,
      p_config: input.config || {},
    });

    if (error) throw error;

    const installation = await this.supabase
      .from('policy_pack_installations')
      .select('*')
      .eq('id', data)
      .single();

    if (installation.error) throw installation.error;
    return mapInstallationFromDb(installation.data);
  }

  async updateInstallation(
    installationId: string,
    input: UpdateInstallationInput
  ): Promise<PackInstallation> {
    const updates: Record<string, unknown> = {};
    if (input.config !== undefined) updates.config = input.config;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.autoUpdate !== undefined) updates.auto_update = input.autoUpdate;
    if (input.updateChannel !== undefined) updates.update_channel = input.updateChannel;
    if (input.pinnedVersion !== undefined) updates.pinned_version = input.pinnedVersion;

    const { data, error } = await this.supabase
      .from('policy_pack_installations')
      .update(updates)
      .eq('id', installationId)
      .select()
      .single();

    if (error) throw error;
    return mapInstallationFromDb(data);
  }

  async uninstallPack(installationId: string): Promise<void> {
    const { error } = await this.supabase
      .from('policy_pack_installations')
      .delete()
      .eq('id', installationId);

    if (error) throw error;
  }

  async getInstalledPolicies(organizationId: string): Promise<InstalledPolicy[]> {
    const { data, error } = await this.supabase.rpc('get_installed_policies', {
      p_organization_id: organizationId,
    });

    if (error) throw error;
    return (data || []) as InstalledPolicy[];
  }

  // ============================================
  // Catalog & Search
  // ============================================

  async searchCatalog(options: SearchOptions = {}): Promise<CatalogEntry[]> {
    let query = this.supabase
      .from('policy_pack_catalog')
      .select('*');

    if (options.category) {
      query = query.eq('category', options.category);
    }
    if (options.official !== undefined) {
      query = query.eq('is_official', options.official);
    }
    if (options.minRating) {
      query = query.gte('avg_rating', options.minRating);
    }
    if (options.query) {
      query = query.or(
        `name.ilike.%${options.query}%,display_name.ilike.%${options.query}%,description.ilike.%${options.query}%`
      );
    }

    switch (options.sortBy) {
      case 'installs':
        query = query.order('install_count', { ascending: false });
        break;
      case 'rating':
        query = query.order('avg_rating', { ascending: false, nullsFirst: false });
        break;
      case 'recent':
        query = query.order('latest_published_at', { ascending: false, nullsFirst: false });
        break;
      case 'name':
      default:
        query = query.order('name');
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name,
      description: row.description,
      category: row.category,
      tags: row.tags,
      publisher: row.publisher,
      publisherVerified: row.publisher_verified,
      isOfficial: row.is_official,
      installCount: row.install_count,
      starCount: row.star_count,
      latestVersion: row.latest_version,
      latestPublishedAt: row.latest_published_at,
      avgRating: row.avg_rating,
      reviewCount: row.review_count,
    }));
  }

  // ============================================
  // Reviews
  // ============================================

  async listReviews(packId: string): Promise<PackReview[]> {
    const { data, error } = await this.supabase
      .from('policy_pack_reviews')
      .select('*')
      .eq('pack_id', packId)
      .eq('is_published', true)
      .order('helpful_count', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (data || []).map((row) => ({
      id: row.id,
      packId: row.pack_id,
      userId: row.user_id,
      organizationId: row.organization_id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      helpfulCount: row.helpful_count,
      verifiedInstallation: row.verified_installation,
      isPublished: row.is_published,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createReview(
    userId: string,
    input: CreateReviewInput,
    organizationId?: string
  ): Promise<PackReview> {
    // Check if user has installed the pack
    let verifiedInstallation = false;
    if (organizationId) {
      const { data } = await this.supabase
        .from('policy_pack_installations')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('pack_id', input.packId)
        .single();
      verifiedInstallation = !!data;
    }

    const { data, error } = await this.supabase
      .from('policy_pack_reviews')
      .insert({
        pack_id: input.packId,
        user_id: userId,
        organization_id: organizationId,
        rating: input.rating,
        title: input.title,
        body: input.body,
        verified_installation: verifiedInstallation,
      })
      .select()
      .single();

    if (error) throw error;

    return {
      id: data.id,
      packId: data.pack_id,
      userId: data.user_id,
      organizationId: data.organization_id,
      rating: data.rating,
      title: data.title,
      body: data.body,
      helpfulCount: data.helpful_count,
      verifiedInstallation: data.verified_installation,
      isPublished: data.is_published,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }
}

// ============================================
// Factory
// ============================================

export function createPolicyPackService(supabase: SupabaseClient): PolicyPackService {
  return new PolicyPackService(supabase);
}
