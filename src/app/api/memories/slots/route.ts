/**
 * Slot Memory API - O(1) deterministic lookups for structured user data
 *
 * GET /api/memories/slots - Get slots by keys or all slots
 * POST /api/memories/slots - Upsert slot values
 * DELETE /api/memories/slots - Delete slots
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import { ValidationErrors, ServerErrors } from '@/lib/api-error';
import {
  getSlots,
  getAllSlots,
  upsertSlot,
  upsertSlots,
  deleteSlot,
  VALID_SLOT_KEYS,
  type SlotData,
} from '@/lib/memory/slot';

// GET /api/memories/slots - Get slots by keys or all slots
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const namespace = searchParams.get('namespace') || 'default';
    const keysParam = searchParams.get('keys');
    const prefix = searchParams.get('prefix');

    let result: SlotData[] | Map<string, string>;

    if (keysParam) {
      // Get specific slots by keys
      const keys = keysParam.split(',').filter(Boolean);
      if (keys.length === 0) {
        return ValidationErrors.missingField('keys');
      }

      // Validate keys
      const invalidKeys = keys.filter((k) => !VALID_SLOT_KEYS.includes(k));
      if (invalidKeys.length > 0) {
        return NextResponse.json(
          {
            error: 'Invalid slot keys',
            invalid_keys: invalidKeys,
            valid_keys: VALID_SLOT_KEYS,
          },
          { status: 400 }
        );
      }

      const slotsMap = await getSlots(userId, keys, namespace);
      result = slotsMap;

      await logRequest(
        { userId, keyId, endpoint: '/api/memories/slots', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        slots: Object.fromEntries(slotsMap),
        count: slotsMap.size,
        requested: keys.length,
      });
    } else {
      // Get all slots (optionally filtered by prefix)
      result = await getAllSlots(userId, namespace, prefix || undefined);

      await logRequest(
        { userId, keyId, endpoint: '/api/memories/slots', method: 'GET', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        slots: result,
        count: result.length,
        prefix: prefix || null,
      });
    }
  } catch (error) {
    console.error('Get slots error:', error);
    return ServerErrors.internal('get_slots');
  }
}

// POST /api/memories/slots - Upsert slot values
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request);
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    const { slots, slot_key, slot_value, namespace = 'default' } = body;

    // Batch upsert
    if (slots && Array.isArray(slots)) {
      // Validate all keys
      const invalidKeys = slots
        .map((s: SlotData) => s.slot_key)
        .filter((k: string) => !VALID_SLOT_KEYS.includes(k));

      if (invalidKeys.length > 0) {
        return NextResponse.json(
          {
            error: 'Invalid slot keys',
            invalid_keys: invalidKeys,
            valid_keys: VALID_SLOT_KEYS,
          },
          { status: 400 }
        );
      }

      const result = await upsertSlots(userId, slots, {
        namespace,
        source: 'api',
      });

      await logRequest(
        { userId, keyId, endpoint: '/api/memories/slots', method: 'POST', startTime },
        200
      );

      return NextResponse.json({
        success: true,
        upserted: result.success,
        failed: result.failed,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    }

    // Single upsert
    if (!slot_key || !slot_value) {
      return ValidationErrors.missingField('slot_key and slot_value (or slots array)');
    }

    if (!VALID_SLOT_KEYS.includes(slot_key)) {
      return NextResponse.json(
        {
          error: 'Invalid slot key',
          invalid_key: slot_key,
          valid_keys: VALID_SLOT_KEYS,
        },
        { status: 400 }
      );
    }

    const result = await upsertSlot(userId, slot_key, slot_value, {
      namespace,
      slotType: body.slot_type || 'string',
      confidence: body.confidence || 1.0,
      source: 'api',
      isPii: body.is_pii || false,
      piiCategory: body.pii_category,
      expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/slots', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      slot: result.slot,
    });
  } catch (error) {
    console.error('Upsert slots error:', error);
    return ServerErrors.internal('upsert_slots');
  }
}

// DELETE /api/memories/slots - Delete slots
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);

    const key = searchParams.get('key');
    const namespace = searchParams.get('namespace') || 'default';

    if (!key) {
      return ValidationErrors.missingField('key');
    }

    const success = await deleteSlot(userId, key, namespace);

    await logRequest(
      { userId, keyId, endpoint: '/api/memories/slots', method: 'DELETE', startTime },
      success ? 200 : 404
    );

    if (!success) {
      return NextResponse.json(
        { error: 'Slot not found or delete failed' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      deleted: key,
    });
  } catch (error) {
    console.error('Delete slot error:', error);
    return ServerErrors.internal('delete_slot');
  }
}
