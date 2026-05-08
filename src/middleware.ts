import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

/**
 * Edge-safe middleware (plan W2.6).
 *
 * Runs the NextAuth `authorized` callback on every request to protected routes
 * before the route handler executes. This refreshes the session cookie on each
 * navigation, preventing the "session feels logged out" symptom users reported
 * when bouncing between landing and dashboard.
 *
 * The full NextAuth instance (with Credentials + Supabase) lives in lib/auth.ts
 * and runs only at the route handler layer (node runtime).
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (handled by their own auth)
     * - _next/static, _next/image (static assets)
     * - favicon.ico, file extensions (static files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*$).*)',
  ],
};
