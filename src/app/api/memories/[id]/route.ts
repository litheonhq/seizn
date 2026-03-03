import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createEmbedding } from '@/lib/ai';
import {
  authenticateRequest,
  isAuthError,
  authErrorResponse,
} from '@/lib/api-auth';
import { logMemoryAccess } from '@/lib/audit';
import { getRequestUser } from '@/lib/api/request-user';
import { ensureCsrfCookie, verifyCsrfToken } from '@/lib/csrf';
import {
  listMemoryImageAttachments,
  type MemoryImageAttachmentRecord,
} from '@/lib/memory/image-attachments';
import crypto from 'crypto';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const ENCRYPTED_PLACEHOLDER = '[encrypted]';

function isMissingContentHashColumnError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  return (error.message || '').toLowerCase().includes('content_hash');
}

function isNoRowsError(
  error: { code?: string | null; message?: string | null } | null | undefined
): boolean {
  return error?.code === 'PGRST116';
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

async function resolvePlanForUser(userId: string): Promise<string> {
  const supabase = createServerClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();
  return profile?.plan || 'free';
}

type ResolvedAuth =
  | { userId: string; keyId: string | null; plan: string; rateLimitHeaders?: Record<string, string> }
  | { error: NextResponse };

async function resolveAuth(request: NextRequest): Promise<ResolvedAuth> {
  const bearerToken = getBearerToken(request);
  const hasLegacyApiKey = Boolean(request.headers.get('x-api-key'));

  if (bearerToken && !hasLegacyApiKey && looksLikeJwt(bearerToken)) {
    const jwtUser = await getRequestUser(request);
    if (jwtUser?.id) {
      return {
        userId: jwtUser.id,
        keyId: null,
        plan: await resolvePlanForUser(jwtUser.id),
      };
    }
  }

  if (!bearerToken && !hasLegacyApiKey) {
    const sessionUser = await getRequestUser(request);
    if (sessionUser?.id) {
      return {
        userId: sessionUser.id,
        keyId: null,
        plan: await resolvePlanForUser(sessionUser.id),
      };
    }
  }

  const authResult = await authenticateRequest(request);
  if (!isAuthError(authResult)) {
    return {
      userId: authResult.userId,
      keyId: authResult.keyId,
      plan: authResult.plan,
      rateLimitHeaders: authResult.rateLimitHeaders,
    };
  }

  if (bearerToken || hasLegacyApiKey) {
    const requestUser = await getRequestUser(request);
    if (requestUser?.id) {
      return {
        userId: requestUser.id,
        keyId: null,
        plan: await resolvePlanForUser(requestUser.id),
      };
    }
  }

  return { error: authErrorResponse(authResult.authError) };
}

/** Merge extra headers into a NextResponse */
function withHeaders(response: NextResponse, headers?: Record<string, string>): NextResponse {
  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }
  return response;
}

// GET /api/memories/[id] - Get a specific memory
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const { userId, keyId } = authResult;
    const supabase = createServerClient();

    // Get memory
    const { data: memory, error: fetchError } = await supabase
      .from('memories')
      .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, companion_meta, scope, source, confidence, importance, created_at, updated_at')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single();

    if (fetchError) {
      if (isNoRowsError(fetchError)) {
        return NextResponse.json(
          { error: 'Memory not found' },
          { status: 404 }
        );
      }

      console.error('Get memory database error:', fetchError);
      return NextResponse.json(
        { error: 'Failed to load memory due to a database error' },
        { status: 500 }
      );
    }

    if (!memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    let attachments: MemoryImageAttachmentRecord[] = [];
    try {
      attachments = await listMemoryImageAttachments({ supabase, userId, memoryId: id });
    } catch (attachmentError) {
      console.error('Get memory attachments error:', attachmentError);
    }

    // Audit log: single memory read
    logMemoryAccess(request, userId, keyId ?? undefined, 'read', {
      memoryId: id,
    }).catch(console.error);

    const response = NextResponse.json({
      success: true,
      memory: memory,
      attachments,
    });
    const withCsrf = ensureCsrfCookie(request, response);
    return withHeaders(withCsrf, authResult.rateLimitHeaders);
  } catch (error) {
    console.error('Get memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/memories/[id] - Update a memory
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;

    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const csrfError = verifyCsrfToken(request);
    if (csrfError) {
      return csrfError;
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    const { data: existingMemory, error: existingError } = await supabase
      .from('memories')
      .select('id, is_encrypted')
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .single();

    if (existingError) {
      if (isNoRowsError(existingError)) {
        return NextResponse.json(
          { error: 'Memory not found' },
          { status: 404 }
        );
      }

      console.error('Lookup memory database error:', existingError);
      return NextResponse.json(
        { error: 'Failed to load existing memory due to a database error' },
        { status: 500 }
      );
    }

    if (!existingMemory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    const updatableFields = [
      'content',
      'encrypted_content',
      'is_encrypted',
      'memory_type',
      'tags',
      'namespace',
      'importance',
      'companion_meta',
    ];
    const hasUpdates = updatableFields.some((field) => body[field] !== undefined);
    if (!hasUpdates) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};

    // Validate and map primitive fields
    const VALID_MEMORY_TYPES = ['fact', 'preference', 'experience', 'relationship', 'instruction'];
    if (body.memory_type !== undefined) {
      if (typeof body.memory_type !== 'string' || !VALID_MEMORY_TYPES.includes(body.memory_type)) {
        return NextResponse.json(
          { error: `memory_type must be one of: ${VALID_MEMORY_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.memory_type = body.memory_type;
    }

    if (body.tags !== undefined) {
      if (!Array.isArray(body.tags) || body.tags.length > 50 ||
          body.tags.some((t: unknown) => typeof t !== 'string' || (t as string).length > 100)) {
        return NextResponse.json(
          { error: 'tags must be an array of max 50 strings, each max 100 characters' },
          { status: 400 }
        );
      }
      updateData.tags = [...new Set(body.tags as string[])];
    }

    if (body.importance !== undefined) {
      const imp = Number(body.importance);
      if (!Number.isFinite(imp) || imp < 1 || imp > 10) {
        return NextResponse.json(
          { error: 'importance must be a number between 1 and 10' },
          { status: 400 }
        );
      }
      updateData.importance = imp;
    }

    if (body.namespace !== undefined) {
      if (
        typeof body.namespace !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(body.namespace)
      ) {
        return NextResponse.json(
          { error: 'namespace must start with alphanumeric, contain only alphanumeric/hyphens/underscores, and be 1-64 characters' },
          { status: 400 }
        );
      }
      updateData.namespace = body.namespace;
    }

    if (body.companion_meta !== undefined) {
      if (
        body.companion_meta !== null &&
        (typeof body.companion_meta !== 'object' || Array.isArray(body.companion_meta))
      ) {
        return NextResponse.json(
          { error: 'companion_meta must be a JSON object or null' },
          { status: 400 }
        );
      }
      updateData.companion_meta = body.companion_meta;
    }

    if (body.is_encrypted !== undefined && typeof body.is_encrypted !== 'boolean') {
      return NextResponse.json(
        { error: 'is_encrypted must be a boolean' },
        { status: 400 }
      );
    }

    let plaintextContent: string | null = null;
    if (body.content !== undefined) {
      if (typeof body.content !== 'string') {
        return NextResponse.json(
          { error: 'content must be a string' },
          { status: 400 }
        );
      }
      const sanitized = body.content.replace(/\x00/g, '');
      if (sanitized.trim().length === 0) {
        return NextResponse.json(
          { error: 'content cannot be empty' },
          { status: 400 }
        );
      }
      if (sanitized.length > 10000) {
        return NextResponse.json(
          { error: 'content too long (max 10,000 chars)' },
          { status: 400 }
        );
      }
      plaintextContent = sanitized;
    }

    let encryptedContent: string | null = null;
    if (body.encrypted_content !== undefined) {
      if (typeof body.encrypted_content !== 'string') {
        return NextResponse.json(
          { error: 'encrypted_content must be a string' },
          { status: 400 }
        );
      }
      if (body.encrypted_content.trim().length === 0) {
        return NextResponse.json(
          { error: 'encrypted_content cannot be empty' },
          { status: 400 }
        );
      }
      if (body.encrypted_content.length > 20000) {
        return NextResponse.json(
          { error: 'encrypted_content too long (max 20,000 chars)' },
          { status: 400 }
        );
      }
      encryptedContent = body.encrypted_content;
    }

    if (plaintextContent !== null && encryptedContent !== null) {
      return NextResponse.json(
        { error: 'content and encrypted_content cannot be provided together' },
        { status: 400 }
      );
    }

    const existingIsEncrypted = existingMemory.is_encrypted === true;
    const requestedEncryptionState = body.is_encrypted;

    if (requestedEncryptionState === true) {
      if (plaintextContent !== null) {
        return NextResponse.json(
          { error: 'content cannot be updated when is_encrypted is true' },
          { status: 400 }
        );
      }
      if (!encryptedContent && !existingIsEncrypted) {
        return NextResponse.json(
          { error: 'encrypted_content is required when enabling encryption' },
          { status: 400 }
        );
      }

      updateData.is_encrypted = true;
      updateData.content = ENCRYPTED_PLACEHOLDER;
      updateData.embedding = null;
      updateData.content_hash = null;
      if (encryptedContent !== null) {
        updateData.encrypted_content = encryptedContent;
      }
    } else {
      if (encryptedContent !== null && requestedEncryptionState === false) {
        return NextResponse.json(
          { error: 'encrypted_content requires is_encrypted=true' },
          { status: 400 }
        );
      }

      if (encryptedContent !== null && existingIsEncrypted && requestedEncryptionState !== false) {
        updateData.is_encrypted = true;
        updateData.content = ENCRYPTED_PLACEHOLDER;
        updateData.embedding = null;
        updateData.content_hash = null;
        updateData.encrypted_content = encryptedContent;
      } else if (encryptedContent !== null && !existingIsEncrypted) {
        return NextResponse.json(
          { error: 'set is_encrypted=true to update encrypted_content' },
          { status: 400 }
        );
      }

      if (plaintextContent !== null) {
        if (existingIsEncrypted && requestedEncryptionState !== false) {
          return NextResponse.json(
            { error: 'set is_encrypted=false to update plaintext content for an encrypted memory' },
            { status: 400 }
          );
        }
        try {
          const embedding = await createEmbedding(plaintextContent);
          updateData.content = plaintextContent;
          updateData.embedding = embedding;
          updateData.content_hash = crypto.createHash('sha256').update(plaintextContent).digest('hex');
          updateData.is_encrypted = false;
          updateData.encrypted_content = null;
        } catch (embeddingError) {
          console.error('Update memory embedding error:', embeddingError);
          return NextResponse.json(
            { error: 'Failed to update memory embedding' },
            { status: 500 }
          );
        }
      } else if (requestedEncryptionState === false) {
        if (existingIsEncrypted) {
          return NextResponse.json(
            { error: 'content is required when disabling encryption' },
            { status: 400 }
          );
        }
        updateData.is_encrypted = false;
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const executeUpdate = async (payload: Record<string, unknown>) => supabase
      .from('memories')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id, content, encrypted_content, is_encrypted, memory_type, tags, namespace, companion_meta, importance, updated_at')
      .single();

    let { data: memory, error: updateError } = await executeUpdate(updateData);

    if (updateError && 'content_hash' in updateData && isMissingContentHashColumnError(updateError)) {
      const { content_hash: _ignored, ...legacyUpdate } = updateData;
      const retry = await executeUpdate(legacyUpdate);
      memory = retry.data;
      updateError = retry.error;
    }

    if (updateError) {
      // PostgREST no rows (single()) path
      if (isNoRowsError(updateError)) {
        return NextResponse.json(
          { error: 'Memory not found or update failed' },
          { status: 404 }
        );
      }

      console.error('Update memory database error:', updateError);
      return NextResponse.json(
        { error: 'Update failed due to a database error' },
        { status: 500 }
      );
    }

    if (!memory) {
      return NextResponse.json(
        { error: 'Memory not found or update failed' },
        { status: 404 }
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        memory: memory,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('Update memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/memories/[id] - Soft delete a memory
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const authResult = await resolveAuth(request);
    if ('error' in authResult) {
      return authResult.error;
    }

    const csrfError = verifyCsrfToken(request);
    if (csrfError) {
      return csrfError;
    }

    const { userId } = authResult;
    const supabase = createServerClient();

    // Soft delete (set is_deleted = true)
    const { data: memory, error: deleteError } = await supabase
      .from('memories')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .select('id')
      .single();

    if (deleteError) {
      if (isNoRowsError(deleteError)) {
        return NextResponse.json(
          { error: 'Memory not found' },
          { status: 404 }
        );
      }

      console.error('Delete memory database error:', deleteError);
      return NextResponse.json(
        { error: 'Delete failed due to a database error' },
        { status: 500 }
      );
    }

    if (!memory) {
      return NextResponse.json(
        { error: 'Memory not found' },
        { status: 404 }
      );
    }

    return withHeaders(
      NextResponse.json({
        success: true,
        message: 'Memory deleted',
        id: memory.id,
      }),
      authResult.rateLimitHeaders
    );
  } catch (error) {
    console.error('Delete memory error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
