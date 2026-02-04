/**
 * Seizn Policy Simulator API
 *
 * POST /api/v1/policy/simulate
 * Test policy decisions without affecting production
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { simulatePolicy } from '@/lib/opa/simulator';
import { getApiKeyFromRequest, validateApiKey } from '@/lib/api-auth';
import { createApiResponse, createApiError } from '@/lib/api-response';
import type { PolicySimulationRequest, PolicySimulationResponse } from '@/lib/opa/types';

// ============================================
// Request Validation Schema
// ============================================

const PolicyUserSchema = z.object({
  id: z.string(),
  role: z.enum(['owner', 'admin', 'member', 'viewer', 'researcher', 'teacher', 'parent', 'student', 'guest']),
  plan: z.enum(['free', 'starter', 'plus', 'pro', 'enterprise']),
  org_id: z.string().optional(),
  has_2fa: z.boolean().optional(),
  allowed_namespaces: z.array(z.string()).optional(),
  grade_band: z.enum(['elementary', 'middle', 'high']).optional(),
  age: z.number().optional(),
  workspace_id: z.string().optional(),
  child_ids: z.array(z.string()).optional(),
});

const PolicyResourceSchema = z.object({
  type: z.enum(['memory', 'trace', 'collection', 'api_key', 'policy', 'receipt']),
  id: z.string().optional(),
  namespace: z.string().optional(),
  collection_id: z.string().optional(),
  owner_id: z.string().optional(),
  workspace_id: z.string().optional(),
  student_id: z.string().optional(),
});

const PolicyContextSchema = z.object({
  ip_address: z.string().optional(),
  user_agent: z.string().optional(),
  timestamp: z.string(),
  request_id: z.string().optional(),
  session_id: z.string().optional(),
  current_memory_count: z.number().optional(),
  current_api_key_count: z.number().optional(),
  request_count_minute: z.number().optional(),
});

const PolicySessionSchema = z.object({
  id: z.string().optional(),
  mode: z.enum(['tutor', 'assessment', 'study']).optional(),
  hints_used: z.number().optional(),
  attempts: z.number().optional(),
  duration_minutes: z.number().optional(),
  workspace_suspended: z.boolean().optional(),
});

const PolicyDataSchema = z.object({
  content: z.string().optional(),
  pii_detected: z.array(z.string()).optional(),
  memory_type: z.string().optional(),
  safety_flags: z.array(z.string()).optional(),
  content_flags: z.array(z.string()).optional(),
  content_level: z.string().optional(),
  tool_name: z.string().optional(),
  share_target: z.object({
    type: z.enum(['internal', 'external']),
    org_id: z.string().optional(),
    user_id: z.string().optional(),
  }).optional(),
  anonymized: z.boolean().optional(),
  file_size_mb: z.number().optional(),
  file_type: z.string().optional(),
  exif: z.object({
    gps_location: z.boolean().optional(),
  }).optional(),
});

const PolicyConfigSchema = z.object({
  pii_action: z.enum(['allow', 'mask', 'deny', 'encrypt']).optional(),
  pii_type_actions: z.record(z.enum(['allow', 'mask', 'deny', 'encrypt'])).optional(),
  retention_days: z.number().optional(),
  ip_allowlist: z.array(z.string()).optional(),
  ip_denylist: z.array(z.string()).optional(),
  require_2fa: z.boolean().optional(),
  log_all_api_calls: z.boolean().optional(),
  allowed_tools: z.array(z.string()).optional(),
  blocked_tools: z.array(z.string()).optional(),
  max_hints: z.number().optional(),
  answer_reveal_allowed: z.boolean().optional(),
  safety_level: z.enum(['child', 'teen', 'adult']).optional(),
});

const PolicyInputSchema = z.object({
  action: z.string(),
  user: PolicyUserSchema,
  resource: PolicyResourceSchema.optional(),
  context: PolicyContextSchema,
  session: PolicySessionSchema.optional(),
  data: PolicyDataSchema.optional(),
  policy_config: PolicyConfigSchema.optional(),
});

const SimulationRequestSchema = z.object({
  input: PolicyInputSchema,
  bundles: z.array(z.string()).optional(),
  entrypoint: z.string().optional(),
  explain: z.boolean().optional().default(false),
});

// ============================================
// POST Handler
// ============================================

export async function POST(request: NextRequest) {
  try {
    // Authenticate request
    const apiKey = getApiKeyFromRequest(request);
    if (!apiKey) {
      return createApiError(401, 'UNAUTHORIZED', 'Missing API key');
    }

    const authResult = await validateApiKey(apiKey);
    if (!authResult.valid) {
      return createApiError(401, 'UNAUTHORIZED', authResult.error || 'Invalid API key');
    }

    // Check permission for policy simulation
    // Only admin and owner roles can simulate policies
    if (!['owner', 'admin'].includes(authResult.user?.role || '')) {
      return createApiError(
        403,
        'FORBIDDEN',
        'Policy simulation requires admin or owner role'
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = SimulationRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return createApiError(
        400,
        'VALIDATION_ERROR',
        'Invalid request body',
        parseResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        }))
      );
    }

    const simulationRequest: PolicySimulationRequest = {
      input: parseResult.data.input as PolicySimulationRequest['input'],
      bundles: parseResult.data.bundles,
      entrypoint: parseResult.data.entrypoint,
      explain: parseResult.data.explain,
    };

    // Run simulation
    const response = await simulatePolicy(simulationRequest);

    // Return response
    return createApiResponse<PolicySimulationResponse>(response);
  } catch (error) {
    console.error('[Policy Simulate API] Error:', error);
    return createApiError(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

// ============================================
// GET Handler - Get policy info
// ============================================

export async function GET(request: NextRequest) {
  try {
    // Authenticate request
    const apiKey = getApiKeyFromRequest(request);
    if (!apiKey) {
      return createApiError(401, 'UNAUTHORIZED', 'Missing API key');
    }

    const authResult = await validateApiKey(apiKey);
    if (!authResult.valid) {
      return createApiError(401, 'UNAUTHORIZED', authResult.error || 'Invalid API key');
    }

    // Return policy metadata
    return createApiResponse({
      version: '1.0.0',
      bundles: ['seizn', 'seizn.k12'],
      entrypoints: [
        'seizn/decision',
        'seizn/allow',
        'seizn/deny_reason',
        'seizn/pii_action',
        'seizn/k12/decision',
        'seizn/k12/hint_level',
        'seizn/k12/safety_action',
      ],
      actions: [
        'memory.write',
        'memory.read',
        'memory.delete',
        'memory.export',
        'trace.share',
        'trace.view',
        'mcp.tool.execute',
        'pii.action',
        'api_key.create',
        'api_key.revoke',
        'policy.update',
        'member.role_change',
        'billing.plan_change',
        'k12.tutor_mode',
        'k12.hint_access',
        'k12.answer_reveal',
        'k12.content',
        'k12.receipt_view',
        'k12.photo_upload',
      ],
      documentation: 'https://docs.seizn.com/policy-as-code',
    });
  } catch (error) {
    console.error('[Policy Info API] Error:', error);
    return createApiError(
      500,
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}
