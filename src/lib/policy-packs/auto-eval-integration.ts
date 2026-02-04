/**
 * Policy Pack Auto-Eval Integration
 *
 * Wraps policy pack operations to emit evaluation triggers.
 * This module should be used instead of direct PolicyPackService
 * calls when auto-eval is desired.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { PolicyPackService } from './service';
import {
  emitPolicyVersionCreated,
  emitPolicyVersionPublished,
  emitPolicyInstalled,
  emitPolicyUpdated,
} from '@/lib/eval/events';
import type {
  PolicyPackVersion,
  PackInstallation,
  CreateVersionInput,
  InstallPackInput,
  UpdateInstallationInput,
} from './types';

/**
 * Enhanced Policy Pack Service with Auto-Eval
 *
 * Extends the base service to automatically emit evaluation triggers
 * when policies are created, published, installed, or updated.
 */
export class PolicyPackServiceWithEval extends PolicyPackService {
  private userId?: string;

  constructor(supabase: SupabaseClient, userId?: string) {
    super(supabase);
    this.userId = userId;
  }

  /**
   * Create a new version and trigger evaluation
   */
  async createVersionWithEval(
    packId: string,
    input: CreateVersionInput,
    options?: { skipEval?: boolean }
  ): Promise<PolicyPackVersion> {
    const version = await this.createVersion(packId, input);

    if (!options?.skipEval) {
      try {
        await emitPolicyVersionCreated({
          userId: this.userId,
          packId,
          versionId: version.id,
          version: version.version,
        });
      } catch (error) {
        console.error('[PolicyPackEval] Failed to emit version created event:', error);
        // Don't fail the operation if eval emission fails
      }
    }

    return version;
  }

  /**
   * Publish a version and trigger evaluation
   */
  async publishVersionWithEval(
    versionId: string,
    options?: { skipEval?: boolean }
  ): Promise<PolicyPackVersion> {
    const version = await this.publishVersion(versionId);

    if (!options?.skipEval) {
      try {
        await emitPolicyVersionPublished({
          userId: this.userId,
          packId: version.packId,
          versionId: version.id,
          version: version.version,
        });
      } catch (error) {
        console.error('[PolicyPackEval] Failed to emit version published event:', error);
      }
    }

    return version;
  }

  /**
   * Install a pack and trigger evaluation
   */
  async installPackWithEval(
    organizationId: string,
    input: InstallPackInput,
    options?: { skipEval?: boolean }
  ): Promise<PackInstallation> {
    const installation = await this.installPack(organizationId, input);

    if (!options?.skipEval) {
      try {
        await emitPolicyInstalled({
          organizationId,
          userId: this.userId,
          packId: installation.packId,
          installationId: installation.id,
          versionId: installation.versionId,
        });
      } catch (error) {
        console.error('[PolicyPackEval] Failed to emit pack installed event:', error);
      }
    }

    return installation;
  }

  /**
   * Update an installation and trigger evaluation
   */
  async updateInstallationWithEval(
    installationId: string,
    input: UpdateInstallationInput,
    options?: { skipEval?: boolean; previousConfig?: Record<string, unknown> }
  ): Promise<PackInstallation> {
    const installation = await this.updateInstallation(installationId, input);

    if (!options?.skipEval) {
      try {
        await emitPolicyUpdated({
          organizationId: installation.organizationId,
          userId: this.userId,
          packId: installation.packId,
          installationId: installation.id,
          previousConfig: options?.previousConfig,
          newConfig: input.config,
        });
      } catch (error) {
        console.error('[PolicyPackEval] Failed to emit installation updated event:', error);
      }
    }

    return installation;
  }
}

/**
 * Factory function to create a service instance with auto-eval
 */
export function createPolicyPackServiceWithEval(
  supabase: SupabaseClient,
  userId?: string
): PolicyPackServiceWithEval {
  return new PolicyPackServiceWithEval(supabase, userId);
}
