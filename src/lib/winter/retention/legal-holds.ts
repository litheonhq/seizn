/**
 * Legal Holds Management
 *
 * Implements legal hold functionality for data retention:
 * - Create/update/release legal holds
 * - Check if data is under hold
 * - Prevent deletion of held data
 */

import { createServerClient } from '@/lib/supabase';
import { logAuditEvent } from '@/lib/winter/org/audit-log';
import type {
  LegalHold,
  LegalHoldStatus,
  LegalHoldScopeType,
  CreateLegalHoldParams,
  UpdateLegalHoldParams,
  ListLegalHoldsParams,
} from './types';
import type { PaginatedResult } from '@/lib/winter/org/types';

// ============================================
// CRUD Operations
// ============================================

/**
 * Create a new legal hold
 */
export async function createLegalHold(
  params: CreateLegalHoldParams
): Promise<LegalHold> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('retention_legal_holds')
    .insert({
      organization_id: params.organization_id,
      name: params.name,
      description: params.description,
      reason: params.reason,
      scope_type: params.scope_type,
      scope_config: params.scope_config,
      effective_from: params.effective_from || new Date().toISOString(),
      effective_until: params.effective_until,
      legal_matter_id: params.legal_matter_id,
      custodian_email: params.custodian_email,
      status: 'active',
      created_by: params.created_by,
    })
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: params.created_by,
    organization_id: params.organization_id,
    action: 'data.deletion_requested', // Using closest available action
    resource_type: 'policies',
    resource_id: data.id,
    details: {
      type: 'legal_hold_created',
      name: params.name,
      scope_type: params.scope_type,
      reason: params.reason,
    },
    status: 'success',
  });

  return data as LegalHold;
}

/**
 * Get a legal hold by ID
 */
export async function getLegalHold(holdId: string): Promise<LegalHold | null> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('retention_legal_holds')
    .select('*')
    .eq('id', holdId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as LegalHold;
}

/**
 * List legal holds for an organization
 */
export async function listLegalHolds(
  params: ListLegalHoldsParams
): Promise<PaginatedResult<LegalHold>> {
  const supabase = createServerClient();
  const limit = params.limit || 50;
  const offset = params.offset || 0;

  let query = supabase
    .from('retention_legal_holds')
    .select('*', { count: 'exact' })
    .eq('organization_id', params.organization_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.status) {
    query = query.eq('status', params.status);
  }

  if (params.scope_type) {
    query = query.eq('scope_type', params.scope_type);
  }

  const { data, error, count } = await query;

  if (error) {
    // Table might not exist
    if (error.code === '42P01') {
      return { data: [], total: 0, limit, offset, has_more: false };
    }
    throw error;
  }

  return {
    data: (data || []) as LegalHold[],
    total: count || 0,
    limit,
    offset,
    has_more: (count || 0) > offset + limit,
  };
}

/**
 * Update a legal hold
 */
export async function updateLegalHold(
  params: UpdateLegalHoldParams,
  updatedBy: string
): Promise<LegalHold> {
  const supabase = createServerClient();

  const current = await getLegalHold(params.id);
  if (!current) {
    throw new Error('Legal hold not found');
  }

  if (current.status !== 'active') {
    throw new Error('Cannot update a released or expired legal hold');
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.reason !== undefined) updates.reason = params.reason;
  if (params.effective_until !== undefined) updates.effective_until = params.effective_until;
  if (params.legal_matter_id !== undefined) updates.legal_matter_id = params.legal_matter_id;
  if (params.custodian_email !== undefined) updates.custodian_email = params.custodian_email;

  const { data, error } = await supabase
    .from('retention_legal_holds')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: updatedBy,
    organization_id: current.organization_id,
    action: 'policy.update',
    resource_type: 'policies',
    resource_id: params.id,
    details: {
      type: 'legal_hold_updated',
      updated_fields: Object.keys(params).filter(k => k !== 'id'),
    },
    status: 'success',
  });

  return data as LegalHold;
}

/**
 * Release a legal hold
 */
export async function releaseLegalHold(
  holdId: string,
  releasedBy: string,
  releaseReason?: string
): Promise<LegalHold> {
  const supabase = createServerClient();

  const current = await getLegalHold(holdId);
  if (!current) {
    throw new Error('Legal hold not found');
  }

  if (current.status !== 'active') {
    throw new Error('Legal hold is already released or expired');
  }

  const { data, error } = await supabase
    .from('retention_legal_holds')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      released_by: releasedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdId)
    .select()
    .single();

  if (error) throw error;

  // Log audit event
  await logAuditEvent({
    user_id: releasedBy,
    organization_id: current.organization_id,
    action: 'data.deletion_completed', // Using closest available action
    resource_type: 'policies',
    resource_id: holdId,
    details: {
      type: 'legal_hold_released',
      name: current.name,
      reason: releaseReason,
    },
    status: 'success',
  });

  return data as LegalHold;
}

/**
 * Check if data is under any active legal hold
 */
export async function isUnderLegalHold(params: {
  organization_id: string;
  data_type?: string;
  record_id?: string;
  user_id?: string;
  tags?: string[];
  created_at?: string;
}): Promise<{ held: boolean; holds: LegalHold[] }> {
  const supabase = createServerClient();

  // Get all active holds for this org
  const { data: holds, error } = await supabase
    .from('retention_legal_holds')
    .select('*')
    .eq('organization_id', params.organization_id)
    .eq('status', 'active')
    .or('effective_until.is.null,effective_until.gt.' + new Date().toISOString());

  if (error) {
    if (error.code === '42P01') {
      return { held: false, holds: [] };
    }
    throw error;
  }

  const matchingHolds: LegalHold[] = [];

  for (const hold of holds || []) {
    const legalHold = hold as LegalHold;
    const config = legalHold.scope_config;

    // Check if hold is currently effective
    const now = new Date();
    const effectiveFrom = new Date(legalHold.effective_from);
    if (now < effectiveFrom) {
      continue;
    }

    if (legalHold.effective_until) {
      const effectiveUntil = new Date(legalHold.effective_until);
      if (now > effectiveUntil) {
        continue;
      }
    }

    // Check scope match
    switch (legalHold.scope_type) {
      case 'all':
        matchingHolds.push(legalHold);
        break;

      case 'user':
        if (params.user_id && config.user_ids?.includes(params.user_id)) {
          matchingHolds.push(legalHold);
        }
        break;

      case 'tag':
        if (params.tags && config.tags?.some(tag => params.tags!.includes(tag))) {
          matchingHolds.push(legalHold);
        }
        break;

      case 'date_range':
        if (params.created_at) {
          const createdAt = new Date(params.created_at);
          const startDate = config.start_date ? new Date(config.start_date) : new Date(0);
          const endDate = config.end_date ? new Date(config.end_date) : new Date('9999-12-31');

          if (createdAt >= startDate && createdAt <= endDate) {
            matchingHolds.push(legalHold);
          }
        }
        break;

      case 'collection':
        // Collection-based holds need to be checked against collection membership
        // This would require knowing which collection the record belongs to
        // For now, we include these holds as potential matches
        if (config.collection_ids && config.collection_ids.length > 0) {
          matchingHolds.push(legalHold);
        }
        break;
    }
  }

  return {
    held: matchingHolds.length > 0,
    holds: matchingHolds,
  };
}

/**
 * Get count of records under legal hold
 */
export async function getLegalHoldStats(organizationId: string): Promise<{
  active_holds: number;
  released_holds: number;
  expired_holds: number;
}> {
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from('retention_legal_holds')
    .select('status')
    .eq('organization_id', organizationId);

  if (error) {
    if (error.code === '42P01') {
      return { active_holds: 0, released_holds: 0, expired_holds: 0 };
    }
    throw error;
  }

  const stats = {
    active_holds: 0,
    released_holds: 0,
    expired_holds: 0,
  };

  for (const hold of data || []) {
    switch (hold.status) {
      case 'active':
        stats.active_holds++;
        break;
      case 'released':
        stats.released_holds++;
        break;
      case 'expired':
        stats.expired_holds++;
        break;
    }
  }

  return stats;
}

/**
 * Expire legal holds that have passed their effective_until date
 */
export async function expireLegalHolds(): Promise<number> {
  const supabase = createServerClient();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('retention_legal_holds')
    .update({
      status: 'expired',
      updated_at: now,
    })
    .eq('status', 'active')
    .lt('effective_until', now)
    .select('id');

  if (error) {
    if (error.code === '42P01') {
      return 0;
    }
    throw error;
  }

  return data?.length || 0;
}
