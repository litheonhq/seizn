import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase';
import { logServerError, logServerWarn } from '@/lib/server/logger';
import {
  normalizeSessionOrganizationId,
  updateProfileOrganizationId,
} from '@/lib/profile/organization';
import { createAuthJsSessionToken } from '@/lib/auth/session-token';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from '@/lib/csrf';
import { GET, PATCH } from '@/app/api/profile/organization/route';

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/server/logger', () => ({
  logServerError: vi.fn(),
  logServerWarn: vi.fn(),
}));

vi.mock('@/lib/profile/organization', () => ({
  normalizeSessionOrganizationId: vi.fn(),
  updateProfileOrganizationId: vi.fn(),
}));

vi.mock('@/lib/auth/session-token', () => ({
  createAuthJsSessionToken: vi.fn().mockResolvedValue('test-session-token'),
  getAuthJsSessionCookieName: vi.fn(() => 'authjs.session-token'),
  getAuthJsSessionCookieOptions: vi.fn(() => ({
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60,
  })),
}));

function createPatchRequest(body: Record<string, unknown>): NextRequest {
  const csrfToken = 'test-csrf-token';
  return new NextRequest('https://example.com/api/profile/organization', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: `${CSRF_COOKIE_NAME}=${csrfToken}`,
      [CSRF_HEADER_NAME]: csrfToken,
    },
    body: JSON.stringify(body),
  });
}

describe('profile organization route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(auth).mockResolvedValue({
      user: {
        id: 'profile-1',
        email: 'user@example.com',
        name: 'User One',
      },
    });
    vi.mocked(normalizeSessionOrganizationId).mockResolvedValue(null);
    vi.mocked(updateProfileOrganizationId).mockResolvedValue(true);
  });

  it('returns the current active organization', async () => {
    const membershipBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          organization: {
            id: 'org-1',
            name: 'Acme',
            slug: 'acme',
          },
        },
        error: null,
      }),
    };

    vi.mocked(normalizeSessionOrganizationId).mockResolvedValueOnce('org-1');
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'organization_members') {
          return membershipBuilder;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      organizationId: 'org-1',
      organization: {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
      },
    });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('returns personal scope without resolving memberships when session explicitly selects personal', async () => {
    vi.mocked(auth).mockResolvedValueOnce({
      user: {
        id: 'profile-1',
        email: 'user@example.com',
        name: 'User One',
        organizationSelection: 'personal',
      },
    } as Awaited<ReturnType<typeof auth>>);
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn(() => {
        throw new Error('membership lookup should not run for explicit personal scope');
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      organizationId: null,
      organization: null,
    });
    expect(normalizeSessionOrganizationId).not.toHaveBeenCalled();
  });

  it('rejects switching to an organization the user does not belong to', async () => {
    const membershipBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: null,
        error: null,
      }),
    };

    const profilesBuilder = {
      update: vi.fn(),
    };

    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'organization_members') {
          return membershipBuilder;
        }

        if (table === 'profiles') {
          return profilesBuilder;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = createPatchRequest({ organizationId: 'org-denied' });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Not a member of this organization' });
    expect(updateProfileOrganizationId).not.toHaveBeenCalled();
  });

  it('updates the active organization when membership is valid', async () => {
    const membershipBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          organization: {
            id: 'org-2',
            name: 'Beta',
            slug: 'beta',
          },
        },
        error: null,
      }),
    };

    const profilesBuilder = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'profile-1' },
              error: null,
            }),
          }),
        }),
      }),
    };

    vi.mocked(updateProfileOrganizationId).mockResolvedValueOnce(true);
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'organization_members') {
          return membershipBuilder;
        }

        if (table === 'profiles') {
          return profilesBuilder;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = createPatchRequest({ organizationId: 'org-2' });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      organizationId: 'org-2',
      organization: {
        id: 'org-2',
        name: 'Beta',
        slug: 'beta',
      },
      persistedToProfile: true,
    });
    expect(updateProfileOrganizationId).toHaveBeenCalledWith(
      expect.any(Object),
      {
        userId: 'profile-1',
        email: 'user@example.com',
      },
      'org-2'
    );
    expect(createAuthJsSessionToken).toHaveBeenCalledWith({
      userId: 'profile-1',
      email: 'user@example.com',
      name: 'User One',
      organizationId: 'org-2',
      organizationSelection: 'organization',
    });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('supports switching back to personal scope', async () => {
    const profilesBuilder = {
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'profile-1' },
              error: null,
            }),
          }),
        }),
      }),
    };

    vi.mocked(updateProfileOrganizationId).mockResolvedValueOnce(true);
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return profilesBuilder;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = createPatchRequest({ organizationId: null });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      organizationId: null,
      organization: null,
      persistedToProfile: true,
    });
    expect(updateProfileOrganizationId).toHaveBeenCalledWith(
      expect.any(Object),
      {
        userId: 'profile-1',
        email: 'user@example.com',
      },
      null
    );
    expect(logServerError).not.toHaveBeenCalled();
    expect(createAuthJsSessionToken).toHaveBeenCalledWith({
      userId: 'profile-1',
      email: 'user@example.com',
      name: 'User One',
      organizationId: null,
      organizationSelection: 'personal',
    });
  });

  it('falls back to session persistence when profile storage is unavailable', async () => {
    const membershipBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          organization: {
            id: 'org-3',
            name: 'Gamma',
            slug: 'gamma',
          },
        },
        error: null,
      }),
    };

    vi.mocked(updateProfileOrganizationId).mockResolvedValueOnce(false);
    vi.mocked(createServerClient).mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'organization_members') {
          return membershipBuilder;
        }

        throw new Error(`Unexpected table ${table}`);
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const request = createPatchRequest({ organizationId: 'org-3' });

    const response = await PATCH(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      organizationId: 'org-3',
      organization: {
        id: 'org-3',
        name: 'Gamma',
        slug: 'gamma',
      },
      persistedToProfile: false,
    });
    expect(logServerWarn).toHaveBeenCalledWith(
      'Profile organization stored in session fallback only',
      null,
      {
        userId: 'profile-1',
        organizationId: 'org-3',
      }
    );
    expect(createAuthJsSessionToken).toHaveBeenCalledWith({
      userId: 'profile-1',
      email: 'user@example.com',
      name: 'User One',
      organizationId: 'org-3',
      organizationSelection: 'organization',
    });
    expect(logServerError).not.toHaveBeenCalled();
  });
});
