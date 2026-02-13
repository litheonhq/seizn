/**
 * License System
 *
 * Handles license key validation, activation, and feature flag management
 * for self-hosted enterprise deployments.
 */

import crypto from "crypto";
import os from "node:os";
import { createServerClient } from "@/lib/supabase";

// License types
export type LicenseType = "trial" | "starter" | "professional" | "enterprise" | "unlimited";
export type DeploymentType = "cloud" | "self_hosted" | "air_gapped";
export type LicenseStatus = "active" | "suspended" | "expired" | "revoked";

// License features interface
export interface LicenseFeatures {
  sso: boolean;
  scim: boolean;
  audit_logs: boolean;
  custom_roles: boolean;
  data_residency: boolean;
  advanced_analytics: boolean;
  priority_support: boolean;
  white_label: boolean;
  air_gapped: boolean;
  api_gateway: boolean;
  semantic_cache: boolean;
  tool_review: boolean;
  annotation_queues: boolean;
  evidence_packs: boolean;
}

// License information
export interface LicenseInfo {
  id: string;
  customerId: string;
  customerName: string;
  licenseType: LicenseType;
  validFrom: Date;
  validUntil: Date;
  features: Partial<LicenseFeatures>;
  maxUsers: number | null;
  maxMemoryGb: number | null;
  maxRequestsPerMonth: number | null;
  deploymentType: DeploymentType;
  status: LicenseStatus;
}

// Validation result
export interface LicenseValidationResult {
  valid: boolean;
  error?: string;
  license?: LicenseInfo;
  activationId?: string;
}

// Feature flag value
export type FeatureFlagValue = boolean | number | string | Record<string, unknown>;

// Default features by license type
const DEFAULT_FEATURES: Record<LicenseType, Partial<LicenseFeatures>> = {
  trial: {
    api_gateway: true,
    semantic_cache: true,
    audit_logs: false,
    sso: false,
    scim: false,
  },
  starter: {
    api_gateway: true,
    semantic_cache: true,
    audit_logs: true,
    sso: false,
    scim: false,
    tool_review: true,
  },
  professional: {
    api_gateway: true,
    semantic_cache: true,
    audit_logs: true,
    sso: true,
    scim: false,
    tool_review: true,
    annotation_queues: true,
    evidence_packs: true,
  },
  enterprise: {
    sso: true,
    scim: true,
    audit_logs: true,
    custom_roles: true,
    data_residency: true,
    advanced_analytics: true,
    priority_support: true,
    api_gateway: true,
    semantic_cache: true,
    tool_review: true,
    annotation_queues: true,
    evidence_packs: true,
  },
  unlimited: {
    sso: true,
    scim: true,
    audit_logs: true,
    custom_roles: true,
    data_residency: true,
    advanced_analytics: true,
    priority_support: true,
    white_label: true,
    air_gapped: true,
    api_gateway: true,
    semantic_cache: true,
    tool_review: true,
    annotation_queues: true,
    evidence_packs: true,
  },
};

/**
 * Generate a license key
 */
export function generateLicenseKey(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(
      crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()
    );
  }
  return `SEIZN-${segments.join("-")}`;
}

/**
 * Hash a license key for storage
 */
export function hashLicenseKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Validate a license key format
 */
export function isValidLicenseKeyFormat(key: string): boolean {
  return /^SEIZN-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(key);
}

/**
 * Validate and activate a license key
 */
export async function validateAndActivateLicense(
  licenseKey: string,
  instanceId: string,
  metadata?: {
    hostname?: string;
    hardwareFingerprint?: string;
    productVersion?: string;
  }
): Promise<LicenseValidationResult> {
  // Validate format
  if (!isValidLicenseKeyFormat(licenseKey)) {
    return { valid: false, error: "Invalid license key format" };
  }

  const supabase = createServerClient();

  // Call activation function
  const { data, error } = await supabase.rpc("activate_license", {
    p_license_key: licenseKey,
    p_instance_id: instanceId,
    p_hardware_fingerprint: metadata?.hardwareFingerprint,
    p_hostname: metadata?.hostname,
    p_product_version: metadata?.productVersion,
  });

  if (error) {
    console.error("License activation error:", error);
    return { valid: false, error: "Failed to validate license" };
  }

  if (!data?.success) {
    return { valid: false, error: data?.error || "License validation failed" };
  }

  const licenseData = data.license;

  return {
    valid: true,
    activationId: data.activation_id,
    license: {
      id: licenseData.license_id,
      customerId: licenseData.customer_id,
      customerName: licenseData.customer_name,
      licenseType: licenseData.license_type,
      validFrom: new Date(),
      validUntil: new Date(licenseData.valid_until),
      features: licenseData.features,
      maxUsers: licenseData.max_users,
      maxMemoryGb: licenseData.max_memory_gb,
      maxRequestsPerMonth: null,
      deploymentType: licenseData.deployment_type,
      status: "active",
    },
  };
}

/**
 * Validate license key without activation
 */
export async function validateLicenseKey(licenseKey: string): Promise<LicenseValidationResult> {
  if (!isValidLicenseKeyFormat(licenseKey)) {
    return { valid: false, error: "Invalid license key format" };
  }

  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("validate_license_key", {
    p_license_key: licenseKey,
  });

  if (error) {
    console.error("License validation error:", error);
    return { valid: false, error: "Failed to validate license" };
  }

  if (!data?.valid) {
    return { valid: false, error: data?.error || "Invalid license" };
  }

  return {
    valid: true,
    license: {
      id: data.license_id,
      customerId: data.customer_id,
      customerName: data.customer_name,
      licenseType: data.license_type,
      validFrom: new Date(),
      validUntil: new Date(data.valid_until),
      features: data.features,
      maxUsers: data.max_users,
      maxMemoryGb: data.max_memory_gb,
      maxRequestsPerMonth: null,
      deploymentType: data.deployment_type,
      status: "active",
    },
  };
}

/**
 * Send license heartbeat
 */
export async function sendLicenseHeartbeat(
  activationId: string
): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("license_activations")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", activationId);

  return !error;
}

/**
 * Deactivate a license
 */
export async function deactivateLicense(activationId: string): Promise<boolean> {
  const supabase = createServerClient();

  const { error } = await supabase
    .from("license_activations")
    .update({
      is_active: false,
      deactivated_at: new Date().toISOString(),
    })
    .eq("id", activationId);

  return !error;
}

/**
 * Get feature flag value
 */
export async function getFeatureFlag(
  flagName: string,
  context?: {
    orgId?: string;
    userId?: string;
    additionalContext?: Record<string, unknown>;
  }
): Promise<FeatureFlagValue | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase.rpc("get_feature_flag", {
    p_flag_name: flagName,
    p_org_id: context?.orgId || null,
    p_user_id: context?.userId || null,
    p_context: context?.additionalContext || {},
  });

  if (error) {
    console.error("Feature flag error:", error);
    return null;
  }

  return data;
}

/**
 * Check if a feature is enabled
 */
export async function isFeatureEnabled(
  featureName: string,
  context?: {
    orgId?: string;
    userId?: string;
    license?: LicenseInfo;
  }
): Promise<boolean> {
  // First check license features
  if (context?.license) {
    const licenseFeature = (context.license.features as Record<string, boolean>)[featureName];
    if (licenseFeature !== undefined) {
      return licenseFeature;
    }
  }

  // Then check feature flag
  const flagValue = await getFeatureFlag(featureName, {
    orgId: context?.orgId,
    userId: context?.userId,
  });

  if (flagValue === null) {
    return false;
  }

  return Boolean(flagValue);
}

/**
 * Get all feature flags for a context
 */
export async function getAllFeatureFlags(context?: {
  orgId?: string;
  userId?: string;
}): Promise<Record<string, FeatureFlagValue>> {
  const supabase = createServerClient();

  const { data: flags, error } = await supabase
    .from("feature_flags")
    .select("name, default_value")
    .eq("is_enabled", true);

  if (error || !flags) {
    return {};
  }

  const result: Record<string, FeatureFlagValue> = {};

  for (const flag of flags) {
    const value = await getFeatureFlag(flag.name, context);
    result[flag.name] = value ?? flag.default_value;
  }

  return result;
}

/**
 * Check license usage limits
 */
export async function checkLicenseUsage(
  licenseId: string
): Promise<{
  withinLimits: boolean;
  usage: {
    users: { current: number; max: number | null };
    memory: { current: number; max: number | null };
    requests: { current: number; max: number | null };
  };
}> {
  const supabase = createServerClient();

  // Get license limits
  const { data: license } = await supabase
    .from("license_keys")
    .select("max_users, max_memory_gb, max_requests_per_month")
    .eq("id", licenseId)
    .single();

  // Get current period usage
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: usage } = await supabase
    .from("license_usage")
    .select("active_users, memory_used_gb, api_requests")
    .eq("license_id", licenseId)
    .eq("period_start", periodStart.toISOString().split("T")[0])
    .single();

  const currentUsage = {
    users: usage?.active_users || 0,
    memory: usage?.memory_used_gb || 0,
    requests: usage?.api_requests || 0,
  };

  const withinLimits = !license || (
    (license.max_users === null || currentUsage.users <= license.max_users) &&
    (license.max_memory_gb === null || currentUsage.memory <= license.max_memory_gb) &&
    (license.max_requests_per_month === null || currentUsage.requests <= license.max_requests_per_month)
  );

  return {
    withinLimits,
    usage: {
      users: { current: currentUsage.users, max: license?.max_users || null },
      memory: { current: currentUsage.memory, max: license?.max_memory_gb || null },
      requests: { current: currentUsage.requests, max: license?.max_requests_per_month || null },
    },
  };
}

/**
 * Get default features for a license type
 */
export function getDefaultFeatures(licenseType: LicenseType): Partial<LicenseFeatures> {
  return DEFAULT_FEATURES[licenseType] || DEFAULT_FEATURES.starter;
}

/**
 * Generate a hardware fingerprint
 */
export function generateHardwareFingerprint(): string {
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || "unknown",
    os.totalmem().toString(),
  ];

  return crypto
    .createHash("sha256")
    .update(components.join("|"))
    .digest("hex")
    .substring(0, 32);
}
