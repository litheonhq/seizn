import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
  logRequest,
} from '@/lib/api-auth';
import crypto from 'crypto';

// Valid webhook events
const VALID_EVENTS = [
  'memory.created',
  'memory.updated',
  'memory.deleted',
] as const;

type WebhookEvent = (typeof VALID_EVENTS)[number];

interface CreateWebhookRequest {
  name: string;
  url: string;
  events?: WebhookEvent[];
  namespace?: string;
}

// GET /api/webhooks - List user's webhooks
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('id, name, url, events, namespace, is_active, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Webhooks fetch error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/webhooks', method: 'GET', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to fetch webhooks' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/webhooks', method: 'GET', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      webhooks: webhooks || [],
      count: webhooks?.length || 0,
    });
  } catch (error) {
    console.error('Webhooks GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/webhooks - Create a new webhook
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body: CreateWebhookRequest = await request.json();

    // Validate required fields
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json({ error: 'Webhook name is required' }, { status: 400 });
    }

    if (!body.url || !body.url.startsWith('https://')) {
      return NextResponse.json(
        { error: 'Valid HTTPS URL is required' },
        { status: 400 }
      );
    }

    // Validate events
    const events = body.events || ['memory.created'];
    for (const event of events) {
      if (!VALID_EVENTS.includes(event)) {
        return NextResponse.json(
          { error: `Invalid event type: ${event}. Valid events: ${VALID_EVENTS.join(', ')}` },
          { status: 400 }
        );
      }
    }

    const supabase = createServerClient();

    // Check webhook limit (max 5 per user for free, 20 for paid)
    const { count } = await supabase
      .from('webhooks')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if ((count || 0) >= 20) {
      return NextResponse.json(
        { error: 'Webhook limit reached (max 20)' },
        { status: 400 }
      );
    }

    // Generate webhook secret for signature verification
    const secret = crypto.randomBytes(32).toString('hex');

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .insert({
        user_id: userId,
        name: body.name.trim(),
        url: body.url,
        secret,
        events,
        namespace: body.namespace || null,
        is_active: true,
      })
      .select('id, name, url, events, namespace, is_active, created_at')
      .single();

    if (error) {
      console.error('Webhook create error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/webhooks', method: 'POST', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to create webhook' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/webhooks', method: 'POST', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      webhook: {
        ...webhook,
        secret, // Return secret only on creation
      },
      message: 'Webhook created. Save the secret - it will not be shown again.',
    });
  } catch (error) {
    console.error('Webhooks POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/webhooks?id=xxx - Delete a webhook
export async function DELETE(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get('id');

    if (!webhookId) {
      return NextResponse.json({ error: 'Webhook ID is required' }, { status: 400 });
    }

    const supabase = createServerClient();

    const { error } = await supabase
      .from('webhooks')
      .delete()
      .eq('id', webhookId)
      .eq('user_id', userId);

    if (error) {
      console.error('Webhook delete error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/webhooks', method: 'DELETE', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to delete webhook' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/webhooks', method: 'DELETE', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      deleted: webhookId,
    });
  } catch (error) {
    console.error('Webhooks DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/webhooks - Update a webhook
export async function PATCH(request: NextRequest) {
  const startTime = Date.now();

  try {
    const authResult = await authenticateRequest(request, { skipUsageCheck: true });
    if (isAuthError(authResult)) {
      return authErrorResponse(authResult.authError);
    }

    const { userId, keyId } = authResult;
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Webhook ID is required' }, { status: 400 });
    }

    // Build update object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.url !== undefined) {
      if (!body.url.startsWith('https://')) {
        return NextResponse.json({ error: 'Valid HTTPS URL is required' }, { status: 400 });
      }
      updates.url = body.url;
    }
    if (body.events !== undefined) {
      for (const event of body.events) {
        if (!VALID_EVENTS.includes(event)) {
          return NextResponse.json(
            { error: `Invalid event type: ${event}` },
            { status: 400 }
          );
        }
      }
      updates.events = body.events;
    }
    if (body.namespace !== undefined) updates.namespace = body.namespace || null;
    if (body.is_active !== undefined) updates.is_active = body.is_active;

    const supabase = createServerClient();

    const { data: webhook, error } = await supabase
      .from('webhooks')
      .update(updates)
      .eq('id', body.id)
      .eq('user_id', userId)
      .select('id, name, url, events, namespace, is_active, created_at, updated_at')
      .single();

    if (error) {
      console.error('Webhook update error:', error);
      await logRequest(
        { userId, keyId, endpoint: '/api/webhooks', method: 'PATCH', startTime },
        500
      );
      return NextResponse.json({ error: 'Failed to update webhook' }, { status: 500 });
    }

    await logRequest(
      { userId, keyId, endpoint: '/api/webhooks', method: 'PATCH', startTime },
      200
    );

    return NextResponse.json({
      success: true,
      webhook,
    });
  } catch (error) {
    console.error('Webhooks PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
