type ProfileIdentity = {
  userId?: string | null;
  email?: string | null;
};

function isMissingRowError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message) : '';

  return (
    code === 'PGRST116' ||
    message.includes('0 rows') ||
    message.includes('multiple (or no) rows returned')
  );
}

export async function resolveProfileUserId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  identity: ProfileIdentity
): Promise<string | null> {
  const userId = identity.userId?.trim() || null;
  const email = identity.email?.trim().toLowerCase() || null;

  if (userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (data?.id) {
      return data.id;
    }

    if (error && !isMissingRowError(error)) {
      return userId;
    }
  }

  if (email) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (data?.id) {
      return data.id;
    }

    if (error && !isMissingRowError(error)) {
      return userId;
    }
  }

  return userId;
}
