import { resolveProfileUserId } from './resolve';
import { createServerClient, hasServerSupabaseServiceRoleConfig } from '@/lib/supabase';

type NormalizeProfileUserIdInput = {
  userId?: string | null;
  email?: string | null;
};

export async function normalizeProfileUserId({
  userId,
  email,
}: NormalizeProfileUserIdInput): Promise<string | null> {
  const normalizedUserId = userId?.trim() || null;
  const normalizedEmail = email?.trim().toLowerCase() || null;

  if (!normalizedUserId && !normalizedEmail) {
    return null;
  }

  if (!hasServerSupabaseServiceRoleConfig()) {
    return normalizedUserId;
  }

  return resolveProfileUserId(createServerClient(), {
    userId: normalizedUserId,
    email: normalizedEmail,
  });
}
