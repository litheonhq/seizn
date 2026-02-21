/**
 * Network Learning Consent API
 *
 * GET: Get current consent status
 * POST: Update consent (opt in/out)
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, isAuthError, authErrorResponse } from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  DEFAULT_NETWORK_LEARNING_CONFIG,
  getConsent,
  optIn,
  optOut,
  updateDataTypes,
  getAvailableSignalTypes,
} from '@/lib/network-learning';
import type { SignalType, ConsentResponse } from '@/lib/network-learning';

// GET /api/network-learning/consent
export async function GET(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    const explicitConsent = await getConsent(userId);
    const consent = explicitConsent ?? {
      userId,
      status: 'opted_in' as const,
      dataTypes: getAvailableSignalTypes(),
      version: DEFAULT_NETWORK_LEARNING_CONFIG.consentVersion,
    };

    return NextResponse.json({
      success: true,
      consent,
      defaultApplied: !explicitConsent,
      availableDataTypes: getAvailableSignalTypes(),
    } satisfies ConsentResponse & { availableDataTypes: SignalType[]; defaultApplied: boolean });
  } catch (err) {
    console.error('Network learning consent GET error:', err);
    return ServerErrors.internal('consent_get');
  }
}

// POST /api/network-learning/consent
// Body:
// {
//   "action": "opt_in" | "opt_out" | "update",
//   "dataTypes"?: SignalType[]  // required for opt_in and update
// }
export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId } = authResult;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return ValidationErrors.invalidBody('Invalid JSON body');
    }

    if (!body || typeof body !== 'object') {
      return ValidationErrors.invalidBody('Request body must be an object');
    }

    const { action, dataTypes } = body as {
      action?: string;
      dataTypes?: unknown;
    };

    if (!action || typeof action !== 'string') {
      return ValidationErrors.missingField('action');
    }

    const validActions = ['opt_in', 'opt_out', 'update'];
    if (!validActions.includes(action)) {
      return ValidationErrors.invalidValue('action', action, 'opt_in | opt_out | update');
    }

    // Handle opt_out
    if (action === 'opt_out') {
      const consent = await optOut(userId);
      return NextResponse.json({
        success: true,
        consent,
        message: 'Successfully opted out of network learning',
      } satisfies ConsentResponse & { message: string });
    }

    // For opt_in and update, dataTypes is required
    if (action === 'opt_in' || action === 'update') {
      const availableTypes = getAvailableSignalTypes();
      const typedDataTypes =
        action === 'opt_in' && !dataTypes
          ? availableTypes
          : Array.isArray(dataTypes)
            ? (dataTypes as SignalType[])
            : null;

      if (!typedDataTypes) {
        return ValidationErrors.missingField('dataTypes (array)');
      }

      // Validate data types
      const invalidTypes = typedDataTypes.filter((dt) => !availableTypes.includes(dt as SignalType));

      if (invalidTypes.length > 0) {
        return ValidationErrors.invalidValue(
          'dataTypes',
          invalidTypes.join(', '),
          availableTypes.join(' | ')
        );
      }

      if (typedDataTypes.length === 0) {
        return ValidationErrors.invalidField('dataTypes', 'At least one data type must be selected');
      }

      if (action === 'opt_in') {
        const consent = await optIn(userId, typedDataTypes);
        return NextResponse.json({
          success: true,
          consent,
          message: 'Successfully opted in to network learning',
        } satisfies ConsentResponse & { message: string }, { status: 201 });
      }

      // action === 'update'
      const consent = await updateDataTypes(userId, typedDataTypes);
      return NextResponse.json({
        success: true,
        consent,
        message: 'Successfully updated consent preferences',
      } satisfies ConsentResponse & { message: string });
    }

    // Should not reach here
    return ValidationErrors.invalidValue('action', action);
  } catch (err) {
    console.error('Network learning consent POST error:', err);

    // Handle specific error messages
    if (err instanceof Error) {
      if (err.message.includes('must be opted in')) {
        return ValidationErrors.invalidField('action', 'User must be opted in to update data types');
      }
    }

    return ServerErrors.internal('consent_post');
  }
}
