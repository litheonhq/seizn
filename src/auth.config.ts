import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

/**
 * Edge-safe NextAuth config (plan W2.6).
 *
 * Why split: NextAuth v5 middleware must run on the Edge runtime, which
 * forbids `node:` modules (fs, crypto with Buffer, etc). The full config
 * in `lib/auth.ts` includes Supabase server client + Turnstile fetch which
 * pull node-only deps via @supabase/supabase-js. We keep those in the
 * node-runtime callsite, and ship only OAuth providers + minimal callbacks
 * here so middleware.ts can import this without bloating the edge bundle.
 */
export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID || process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || process.env.GITHUB_SECRET || '',
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  trustHost: true,
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    /**
     * Edge-safe gate. Runs in middleware to block unauthenticated access to
     * protected routes before the request reaches the route handler. Heavy
     * profile/organization normalization stays in the node-runtime callbacks
     * (lib/auth.ts) and runs only when the route handler executes.
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const protectedPrefixes = ['/dashboard', '/cli-auth', '/invite'];
      const isProtected = protectedPrefixes.some((p) => nextUrl.pathname.startsWith(p));

      if (isProtected) {
        return isLoggedIn;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
