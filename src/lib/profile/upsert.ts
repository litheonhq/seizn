type ProfileUpsertResult = { ok: true } | { ok: false; error: unknown };

export function buildProfileUpsertPayloads(userId: string, email?: string | null, name?: string) {
  const localPart = email?.split('@')[0] || 'user';
  const normalized = localPart.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'user';
  const shortId = userId.replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase();
  const fallbackHandle = `${normalized}_${shortId}`;
  const fallbackName = name?.trim() || localPart || 'User';

  const minimalPayload: Record<string, unknown> = { id: userId };
  if (email) {
    minimalPayload.email = email;
  }

  const profilePayload = {
    ...minimalPayload,
    full_name: fallbackName,
    name: fallbackName,
    plan: 'free',
    language: 'en',
  };

  return [
    minimalPayload,
    {
      ...minimalPayload,
      plan: 'free',
    },
    profilePayload,
    {
      ...profilePayload,
      handle: fallbackHandle,
      username: fallbackHandle,
    },
    {
      ...profilePayload,
      handle: fallbackHandle,
      display_name: fallbackName,
      role: 'buyer',
    },
  ];
}

export async function upsertProfileWithFallback(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  email?: string | null,
  name?: string
): Promise<ProfileUpsertResult> {
  let lastError: unknown = null;
  const payloads = buildProfileUpsertPayloads(userId, email, name);

  for (const payload of payloads) {
    const { error } = await supabase.from('profiles').upsert(payload, { onConflict: 'id' });
    if (!error) {
      return { ok: true };
    }
    lastError = error;
  }

  return { ok: false, error: lastError };
}
