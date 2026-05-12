import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import type { Profile } from 'next-auth';
import { authConfig } from '@/auth.config';
import { normalizeProfileUserId } from './profile/normalize';
import { normalizeSessionOrganizationId } from './profile/organization';
import { createServerClient } from './supabase';
import { logServerError } from '@/lib/server/logger';
import {
  getAuthCookiePrefix,
  getSharedAuthCookieOptions,
} from '@/lib/auth/cookie-options';

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERCEL_ENV = process.env.VERCEL_ENV;
const IS_PRODUCTION = VERCEL_ENV
  ? VERCEL_ENV === 'production'
  : process.env.NODE_ENV === 'production';
const SHOULD_VERIFY_TURNSTILE = IS_PRODUCTION || Boolean(TURNSTILE_SECRET_KEY);

async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    if (IS_PRODUCTION) {
      logServerError(
        'TURNSTILE_SECRET_KEY not configured in production; CAPTCHA verification unavailable',
        new Error('Missing TURNSTILE_SECRET_KEY')
      );
      return false;
    }
    return true;
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET_KEY);
    formData.append('response', token);

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    logServerError('Turnstile verification error', error);
    return false;
  }
}

const cookiePrefix = getAuthCookiePrefix();
const sharedCookieOptions = getSharedAuthCookieOptions();

function getOAuthEmailVerified(token: { email_verified?: unknown }, profile?: Profile): boolean {
  const profileRecord = profile as Record<string, unknown> | undefined;
  const raw =
    token.email_verified ??
    profileRecord?.email_verified ??
    profileRecord?.emailVerified ??
    profileRecord?.verified_email;

  return raw === true || raw === 'true';
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    // Email/Password via Supabase (node-runtime only — uses @supabase/supabase-js)
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Verify Turnstile CAPTCHA when configured, and always in production.
        if (SHOULD_VERIFY_TURNSTILE) {
          const token = typeof credentials.turnstileToken === 'string' ? credentials.turnstileToken : '';
          if (!token) {
            throw new Error('CAPTCHA verification required');
          }

          const isValidCaptcha = await verifyTurnstileToken(token);
          if (!isValidCaptcha) {
            throw new Error('CAPTCHA verification failed');
          }
        }

        const supabase = createServerClient();

        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email as string,
          password: credentials.password as string,
        });

        if (error || !data.user) {
          return null;
        }

        return {
          id: data.user.id,
          email: data.user.email,
          name: data.user.user_metadata?.full_name || data.user.email,
          image: data.user.user_metadata?.avatar_url,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id;
        if (user.organizationSelection === 'personal') {
          token.organizationSelection = 'personal';
          delete token.organizationId;
        } else if (typeof user.organizationId === 'string' && user.organizationId.trim()) {
          token.organizationId = user.organizationId;
          token.organizationSelection = 'organization';
        }
      }

      // For OAuth providers, create/link Supabase user
      if (account && account.provider !== 'credentials') {
        const supabase = createServerClient();
        const profileId =
          typeof token.sub === 'string' && token.sub.trim()
            ? token.sub
            : typeof token.id === 'string' && token.id.trim()
              ? token.id
              : null;
        const email = typeof token.email === 'string' ? token.email.trim().toLowerCase() : null;
        const emailVerified = getOAuthEmailVerified(token, profile);
        token.oauthEmailVerified = emailVerified;

        if (!profileId) {
          return token;
        }

        // Prefer an exact provider-account profile. Only link an existing
        // email profile when the provider explicitly attests that email.
        const { data: idProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', profileId)
          .single();
        let linkedProfile = idProfile;

        if (!linkedProfile && email && emailVerified) {
          const { data: emailProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', email)
            .single();
          linkedProfile = emailProfile;
        }

        if (!linkedProfile) {
          // Create profile for OAuth user. profiles.email is UNIQUE — when
          // the provider didn't attest email_verified (so we couldn't
          // link above) but a record with the same email already exists,
          // the insert raises 23505. Surfacing it lets the OAuth callback
          // refuse rather than silently leave token.id pointing at a
          // non-existent profile (returns NULL for joined queries).
          const { data: insertedProfile, error: insertError } = await supabase
            .from('profiles')
            .insert({
              id: profileId,
              email,
              full_name: token.name,
              avatar_url: token.picture,
              plan: 'free',
            })
            .select('id')
            .single();

          if (insertError) {
            const isUniqueViolation =
              insertError.code === '23505' ||
              (typeof insertError.message === 'string' &&
                insertError.message.toLowerCase().includes('duplicate key'));
            if (isUniqueViolation) {
              throw new Error('OAuthAccountNotLinked');
            }
            throw insertError;
          }
          linkedProfile = insertedProfile;
        }

        token.id = linkedProfile?.id || profileId;
      }

      if (token.email && (!token.id || token.id === token.sub)) {
        const canResolveByEmail = token.oauthEmailVerified !== false;
        const resolvedProfileId = await normalizeProfileUserId({
          userId:
            typeof token.id === 'string'
              ? token.id
              : typeof token.sub === 'string'
                ? token.sub
                : null,
          email: canResolveByEmail && typeof token.email === 'string' ? token.email : null,
        });

        if (resolvedProfileId) {
          token.id = resolvedProfileId;
        }
      }

      if (token.organizationSelection !== 'personal' && !token.organizationId) {
        const resolvedOrganizationId = await normalizeSessionOrganizationId({
          userId:
            typeof token.id === 'string'
              ? token.id
              : typeof token.sub === 'string'
                ? token.sub
                : null,
          email:
            token.oauthEmailVerified !== false && typeof token.email === 'string'
              ? token.email
              : null,
          organizationSelection: null,
        });

        if (resolvedOrganizationId) {
          token.organizationId = resolvedOrganizationId;
          token.organizationSelection = 'organization';
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        try {
          const resolvedProfileId = await normalizeProfileUserId({
            userId:
              typeof token.id === 'string'
                ? token.id
                : typeof token.sub === 'string'
                  ? token.sub
                  : null,
            email:
              token.oauthEmailVerified !== false
                ? session.user.email ?? (typeof token.email === 'string' ? token.email : null)
                : null,
          });

          if (resolvedProfileId) {
            session.user.id = resolvedProfileId;
          } else if (typeof token.id === 'string') {
            session.user.id = token.id;
          } else if (typeof token.sub === 'string') {
            session.user.id = token.sub;
          }

          if (token.organizationSelection === 'personal') {
            session.user.organizationId = null;
            session.user.organizationSelection = 'personal';
            token.organizationId = null;
          } else {
            const resolvedOrganizationId =
              (await normalizeSessionOrganizationId({
                userId: session.user.id,
                email:
                  token.oauthEmailVerified !== false
                    ? session.user.email ??
                      (typeof token.email === 'string' ? token.email : null)
                    : null,
                organizationSelection: null,
              })) ||
              (typeof token.organizationId === 'string' && token.organizationId.trim()
                ? token.organizationId
                : null);

            if (resolvedOrganizationId) {
              session.user.organizationId = resolvedOrganizationId;
              session.user.organizationSelection = 'organization';
              token.organizationId = resolvedOrganizationId;
              token.organizationSelection = 'organization';
            } else {
              session.user.organizationId = null;
              session.user.organizationSelection = undefined;
              token.organizationId = null;
            }
          }
        } catch (error) {
          logServerError('Auth session normalization failed; preserving token fallback', error, {
            hasTokenId: typeof token.id === 'string',
            hasTokenSub: typeof token.sub === 'string',
            hasEmail: typeof token.email === 'string',
          });
          if (!session.user.id) {
            session.user.id =
              typeof token.id === 'string'
                ? token.id
                : typeof token.sub === 'string'
                  ? token.sub
                  : session.user.id;
          }
          session.user.organizationId =
            token.organizationSelection === 'personal'
              ? null
              : typeof token.organizationId === 'string'
                ? token.organizationId
                : session.user.organizationId ?? null;
          session.user.organizationSelection =
            token.organizationSelection === 'personal' || token.organizationSelection === 'organization'
              ? token.organizationSelection
              : session.user.organizationSelection;
        }
      }
      return session;
    },
    async redirect({ url, baseUrl }) {
      try {
        const safeUrl = new URL(url, baseUrl);
        if (safeUrl.origin !== new URL(baseUrl).origin) {
          return baseUrl;
        }
        return safeUrl.toString();
      } catch {
        return baseUrl;
      }
    },
  },
  // pages, trustHost, session, secret inherited from authConfig (W2.6 split).
  cookies: {
    sessionToken: {
      name: `${cookiePrefix}authjs.session-token`,
      options: sharedCookieOptions,
    },
    callbackUrl: {
      name: `${cookiePrefix}authjs.callback-url`,
      options: sharedCookieOptions,
    },
    pkceCodeVerifier: {
      name: `${cookiePrefix}authjs.pkce.code_verifier`,
      options: { ...sharedCookieOptions, maxAge: 60 * 15 },
    },
    state: {
      name: `${cookiePrefix}authjs.state`,
      options: { ...sharedCookieOptions, maxAge: 60 * 15 },
    },
    nonce: {
      name: `${cookiePrefix}authjs.nonce`,
      options: sharedCookieOptions,
    },
    webauthnChallenge: {
      name: `${cookiePrefix}authjs.challenge`,
      options: { ...sharedCookieOptions, maxAge: 60 * 15 },
    },
  },
});

// Type augmentation moved to src/types/next-auth.d.ts
