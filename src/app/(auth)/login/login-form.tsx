"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Turnstile from "@/components/auth/Turnstile";
import { AuthCard, AuthDivider, AuthHomeLink, AuthPage } from "@/components/auth/auth-shell";
import { sanitizeRelativeRedirect } from "@/lib/security/redirect";

function buildAuthHref(path: string, callbackUrl: string): string {
  if (callbackUrl === "/dashboard") {
    return path;
  }
  return `${path}?${new URLSearchParams({ callbackUrl }).toString()}`;
}

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = sanitizeRelativeRedirect(searchParams.get("callbackUrl"));
  const signupHref = buildAuthHref("/signup", callbackUrl);
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(error);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const authStatusRef = useRef<HTMLDivElement>(null);

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  // Reset loading state when page becomes visible (user came back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        setIsLoading(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (authError) {
      authStatusRef.current?.focus();
    }
  }, [authError]);

  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError(null);

    const result = await signIn("credentials", {
      email,
      password,
      turnstileToken: turnstileToken || "",
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      if (result.error.includes('CAPTCHA')) {
        setAuthError("CAPTCHA verification failed. Please try again.");
      } else {
        setAuthError("Invalid email or password");
      }
      setIsLoading(false);
    } else {
      router.push(callbackUrl);
    }
  };

  const handleOAuthLogin = (provider: string) => {
    setIsLoading(true);
    signIn(provider, { callbackUrl });
  };

  return (
    <AuthPage subtitle="Sign in to your account">
      <AuthCard>
          {authError && (
            <div
              ref={authStatusRef}
              role="alert"
              aria-live="assertive"
              tabIndex={-1}
              className="auth-status auth-status-conflict mb-6"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {authError}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => handleOAuthLogin("github")}
              disabled={isLoading}
              className="auth-btn-oauth-github w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md font-medium disabled:opacity-50"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              Continue with GitHub
            </button>

            <button
              onClick={() => handleOAuthLogin("google")}
              disabled={isLoading}
              className="auth-btn-secondary w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md font-medium disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </button>
          </div>

          <AuthDivider />

          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="auth-label">
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="input-elegant w-full"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="auth-label">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-elegant w-full"
                placeholder="Enter your password"
              />
            </div>

            {/* Cloudflare Turnstile CAPTCHA */}
            {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
              <div className="flex justify-center">
                <Turnstile
                  onVerify={handleTurnstileVerify}
                  onExpire={handleTurnstileExpire}
                  theme="light"
                  size="normal"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || (turnstileRequired && !turnstileToken)}
              className="auth-btn-primary w-full rounded-md py-3.5 text-[15px] font-semibold disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <p className="auth-body mt-6 text-center">
            Don&apos;t have an account?{" "}
            <Link href={signupHref} className="auth-link">
              Sign up
            </Link>
          </p>
      </AuthCard>
      <AuthHomeLink />
    </AuthPage>
  );
}
