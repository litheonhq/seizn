/**
 * Data Residency Service
 *
 * Manages data residency policies and region configuration for organizations.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  DataRegion,
  RegionCode,
  DeploymentSKU,
  DataResidencyPolicy,
  ReplicationPolicy,
  ComplianceFramework,
  DataTransferRecord,
  REGION_DEFINITIONS,
  SKU_DEFINITIONS,
  getAvailableRegions,
  isRegionCompliant,
  getRegionEndpoints,
  RegionEndpoint,
} from './types';

export class DataResidencyService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get organization's data residency policy
   */
  async getPolicy(organizationId: string): Promise<DataResidencyPolicy | null> {
    const { data, error } = await this.supabase
      .from('data_residency_policies')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      organizationId: data.organization_id,
      primaryRegion: data.primary_region,
      allowedRegions: data.allowed_regions,
      replicationPolicy: data.replication_policy,
      complianceRequirements: data.compliance_requirements,
      dataCategories: data.data_categories,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Create or update data residency policy
   */
  async setPolicy(
    organizationId: string,
    policy: Partial<DataResidencyPolicy>
  ): Promise<DataResidencyPolicy> {
    // Validate region availability
    if (policy.primaryRegion) {
      const region = REGION_DEFINITIONS[policy.primaryRegion];
      if (!region || !region.available) {
        throw new Error(`Region ${policy.primaryRegion} is not available`);
      }
    }

    // Validate compliance requirements
    if (policy.primaryRegion && policy.complianceRequirements) {
      if (!isRegionCompliant(policy.primaryRegion, policy.complianceRequirements)) {
        throw new Error(
          `Region ${policy.primaryRegion} does not meet compliance requirements`
        );
      }
    }

    const { data, error } = await this.supabase
      .from('data_residency_policies')
      .upsert({
        organization_id: organizationId,
        primary_region: policy.primaryRegion,
        allowed_regions: policy.allowedRegions,
        replication_policy: policy.replicationPolicy,
        compliance_requirements: policy.complianceRequirements,
        data_categories: policy.dataCategories,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id',
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to set policy: ${error.message}`);

    return {
      id: data.id,
      organizationId: data.organization_id,
      primaryRegion: data.primary_region,
      allowedRegions: data.allowed_regions,
      replicationPolicy: data.replication_policy,
      complianceRequirements: data.compliance_requirements,
      dataCategories: data.data_categories,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  /**
   * Get available regions for organization's SKU
   */
  async getAvailableRegionsForOrg(organizationId: string): Promise<RegionCode[]> {
    // Get organization's subscription/SKU
    const { data: org } = await this.supabase
      .from('organizations')
      .select('subscription_tier')
      .eq('id', organizationId)
      .single();

    const sku = (org?.subscription_tier || 'starter') as DeploymentSKU;
    const regions = getAvailableRegions(sku);

    return regions.map((r) => r.code);
  }

  /**
   * Validate if data transfer is allowed
   */
  async isTransferAllowed(
    organizationId: string,
    sourceRegion: RegionCode,
    destinationRegion: RegionCode,
    dataCategory?: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const policy = await this.getPolicy(organizationId);

    if (!policy) {
      // No policy = use defaults (single region, no restrictions)
      return { allowed: sourceRegion === destinationRegion };
    }

    // Check if destination is in allowed regions
    if (!policy.allowedRegions.includes(destinationRegion)) {
      return {
        allowed: false,
        reason: `Destination region ${destinationRegion} is not in allowed regions`,
      };
    }

    // Check replication policy
    if (policy.replicationPolicy === 'single-region') {
      if (sourceRegion !== destinationRegion) {
        return {
          allowed: false,
          reason: 'Single-region policy prohibits cross-region transfers',
        };
      }
    }

    // Check regional failover (must be same data region)
    if (policy.replicationPolicy === 'regional-failover') {
      const srcDataRegion = REGION_DEFINITIONS[sourceRegion].dataRegion;
      const dstDataRegion = REGION_DEFINITIONS[destinationRegion].dataRegion;

      if (srcDataRegion !== dstDataRegion) {
        return {
          allowed: false,
          reason: 'Regional failover policy prohibits cross-data-region transfers',
        };
      }
    }

    // Check compliance requirements
    if (policy.complianceRequirements.includes('GDPR')) {
      const srcRegion = REGION_DEFINITIONS[sourceRegion];
      const dstRegion = REGION_DEFINITIONS[destinationRegion];

      // GDPR: EU data must stay in EU unless adequacy decision
      if (srcRegion.dataRegion === 'eu' && dstRegion.dataRegion !== 'eu') {
        return {
          allowed: false,
          reason: 'GDPR compliance requires EU data to remain within EU',
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Record data transfer for audit
   */
  async recordTransfer(transfer: Omit<DataTransferRecord, 'id'>): Promise<void> {
    await this.supabase.from('data_transfer_records').insert({
      source_region: transfer.sourceRegion,
      destination_region: transfer.destinationRegion,
      data_category: transfer.dataCategory,
      transfer_type: transfer.transferType,
      legal_basis: transfer.legalBasis,
      timestamp: transfer.timestamp,
      size_bytes: transfer.sizeBytes,
      encrypted: transfer.encrypted,
    });
  }

  /**
   * Get transfer audit log
   */
  async getTransferLog(
    organizationId: string,
    options?: {
      startDate?: string;
      endDate?: string;
      sourceRegion?: RegionCode;
      limit?: number;
    }
  ): Promise<DataTransferRecord[]> {
    let query = this.supabase
      .from('data_transfer_records')
      .select('*')
      .eq('organization_id', organizationId)
      .order('timestamp', { ascending: false });

    if (options?.startDate) {
      query = query.gte('timestamp', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('timestamp', options.endDate);
    }
    if (options?.sourceRegion) {
      query = query.eq('source_region', options.sourceRegion);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data } = await query;

    return (data || []).map((row) => ({
      id: row.id,
      sourceRegion: row.source_region,
      destinationRegion: row.destination_region,
      dataCategory: row.data_category,
      transferType: row.transfer_type,
      legalBasis: row.legal_basis,
      timestamp: row.timestamp,
      sizeBytes: row.size_bytes,
      encrypted: row.encrypted,
    }));
  }

  /**
   * Get region endpoints for organization
   */
  async getEndpoints(organizationId: string): Promise<RegionEndpoint> {
    const policy = await this.getPolicy(organizationId);
    const region = policy?.primaryRegion || 'us-east-1';
    return getRegionEndpoints(region);
  }

  /**
   * Get compliance summary for organization
   */
  async getComplianceSummary(organizationId: string): Promise<{
    region: RegionCode;
    dataRegion: DataRegion;
    complianceFrameworks: ComplianceFramework[];
    replicationPolicy: ReplicationPolicy;
    gdprCompliant: boolean;
    ccpaCompliant: boolean;
  }> {
    const policy = await this.getPolicy(organizationId);
    const region = policy?.primaryRegion || 'us-east-1';
    const regionConfig = REGION_DEFINITIONS[region];

    return {
      region,
      dataRegion: regionConfig.dataRegion,
      complianceFrameworks: regionConfig.complianceFrameworks,
      replicationPolicy: policy?.replicationPolicy || 'single-region',
      gdprCompliant: regionConfig.complianceFrameworks.includes('GDPR'),
      ccpaCompliant: regionConfig.complianceFrameworks.includes('CCPA'),
    };
  }

  /**
   * Migrate organization to a new region
   */
  async initiateRegionMigration(
    organizationId: string,
    targetRegion: RegionCode
  ): Promise<{
    migrationId: string;
    estimatedDuration: string;
    steps: string[];
  }> {
    // Validate target region
    const available = await this.getAvailableRegionsForOrg(organizationId);
    if (!available.includes(targetRegion)) {
      throw new Error(`Region ${targetRegion} is not available for this organization`);
    }

    // Create migration record
    const { data, error } = await this.supabase
      .from('region_migrations')
      .insert({
        organization_id: organizationId,
        target_region: targetRegion,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to initiate migration: ${error.message}`);

    return {
      migrationId: data.id,
      estimatedDuration: '2-4 hours',
      steps: [
        '1. Create data snapshot',
        '2. Provision resources in target region',
        '3. Replicate data to target region',
        '4. Verify data integrity',
        '5. Update DNS records',
        '6. Switch traffic to target region',
        '7. Cleanup source resources (after grace period)',
      ],
    };
  }
}

// Factory function for creating the service
export function createResidencyService(supabase: SupabaseClient): DataResidencyService {
  return new DataResidencyService(supabase);
}
