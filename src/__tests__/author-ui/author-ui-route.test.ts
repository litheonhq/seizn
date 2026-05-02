import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/api/request-user';
import { isAuthorUiAccessAllowed, withAuthorUiService } from '@/lib/author/ui/route';

vi.mock('@/lib/api/request-user', () => ({
  getRequestUser: vi.fn(),
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  AUTHOR_UI_ENABLED: process.env.AUTHOR_UI_ENABLED,
  AUTHOR_UI_ALLOWED_USER_IDS: process.env.AUTHOR_UI_ALLOWED_USER_IDS,
  AUTHOR_UI_ALLOWED_EMAILS: process.env.AUTHOR_UI_ALLOWED_EMAILS,
};

describe('Author UI route guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTHOR_UI_ENABLED;
    delete process.env.AUTHOR_UI_ALLOWED_USER_IDS;
    delete process.env.AUTHOR_UI_ALLOWED_EMAILS;
  });

  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    restoreEnv('AUTHOR_UI_ENABLED', ORIGINAL_ENV.AUTHOR_UI_ENABLED);
    restoreEnv('AUTHOR_UI_ALLOWED_USER_IDS', ORIGINAL_ENV.AUTHOR_UI_ALLOWED_USER_IDS);
    restoreEnv('AUTHOR_UI_ALLOWED_EMAILS', ORIGINAL_ENV.AUTHOR_UI_ALLOWED_EMAILS);
  });

  it('allows non-production access unless explicitly disabled', () => {
    process.env.NODE_ENV = 'test';

    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(true);

    process.env.AUTHOR_UI_ENABLED = 'false';
    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(false);
  });

  it('requires explicit production enablement and allowlist membership', () => {
    process.env.NODE_ENV = 'production';

    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(false);

    process.env.AUTHOR_UI_ENABLED = '1';
    process.env.AUTHOR_UI_ALLOWED_USER_IDS = 'user-2';
    process.env.AUTHOR_UI_ALLOWED_EMAILS = 'author@example.com';

    expect(isAuthorUiAccessAllowed({ id: 'user-1', email: 'user@example.com' })).toBe(false);
    expect(isAuthorUiAccessAllowed({ id: 'user-2', email: 'user@example.com' })).toBe(true);
    expect(isAuthorUiAccessAllowed({ id: 'user-3', email: 'AUTHOR@example.com' })).toBe(true);
  });

  it('returns 403 before exposing fixture data to blocked production users', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTHOR_UI_ENABLED = '1';
    process.env.AUTHOR_UI_ALLOWED_USER_IDS = 'other-user';
    vi.mocked(getRequestUser).mockResolvedValue({
      id: 'blocked-user',
      email: 'blocked@example.com',
      name: null,
      lastSignInAt: null,
      organizationId: null,
      organizationSelection: null,
    });

    const response = await withAuthorUiService(
      new NextRequest('https://example.com/api/projects'),
      () => ({ ok: true })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Author UI is not enabled for this account' });
  });
});

function restoreEnv(name: keyof typeof ORIGINAL_ENV, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
