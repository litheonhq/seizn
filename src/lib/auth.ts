import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { normalizeProfileUserId } from './profile/normalize';
import { createServerClient } from './supabase';
import { logServerError } from '@/lib/server/logger';

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

async function verifyTurnstileToken(token: string): Promise<boolean> {
  if (!TURNSTILE_SECRET_KEY) {
    // Skip verification if not configured (development)
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

const useSecureCookies = process.env.NODE_ENV === 'production';
const cookiePrefix = useSecureCookies ? '__Secure-' : '';

function getCookieDomain() {
  if (process.env.AUTH_COOKIE_DOMAIN) {
    return process.env.AUTH_COOKIE_DOMAIN;
  }

  const url = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) return undefined;

  try {
    const hostname = new URL(url).hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined;
    return hostname.startsWith('.') ? hostname : `.${hostname}`;
  } catch {
    return undefined;
  }
}

const cookieDomain = getCookieDomain();

const sharedCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: useSecureCookies,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // GitHub OAuth
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET || '',
    }),
    // Google OAuth
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    // Email/Password via Supabase
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

        // Verify Turnstile CAPTCHA if configured.
        if (TURNSTILE_SECRET_KEY) {
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
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }

      // For OAuth providers, create/link Supabase user
      if (account && account.provider !== 'credentials') {
        const supabase = createServerClient();

        // Check if user exists in profiles
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('email', token.email)
          .single();

        if (!profile) {
          // Create profile for OAuth user
          await supabase.from('profiles').insert({
            id: token.id || token.sub,
            email: token.email,
            full_name: token.name,
            avatar_url: token.picture,
            plan: 'free',
          });
        }

        token.id = profile?.id || token.sub;
      }

      if (token.email && (!token.id || token.id === token.sub)) {
        const resolvedProfileId = await normalizeProfileUserId({
          userId:
            typeof token.id === 'string'
              ? token.id
              : typeof token.sub === 'string'
                ? token.sub
                : null,
          email: typeof token.email === 'string' ? token.email : null,
        });

        if (resolvedProfileId) {
          token.id = resolvedProfileId;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const resolvedProfileId = await normalizeProfileUserId({
          userId:
            typeof token.id === 'string'
              ? token.id
              : typeof token.sub === 'string'
                ? token.sub
                : null,
          email: session.user.email ?? (typeof token.email === 'string' ? token.email : null),
        });

        if (resolvedProfileId) {
          session.user.id = resolvedProfileId;
        } else if (typeof token.id === 'string') {
          session.user.id = token.id;
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
  pages: {
    signIn: '/login',
    error: '/login',
  },
  trustHost: true,
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
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
});

// Type augmentation moved to src/types/next-auth.d.ts
