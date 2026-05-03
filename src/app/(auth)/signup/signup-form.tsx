"use client";

import { useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Turnstile from "@/components/auth/Turnstile";
import { AuthCard, AuthDivider, AuthHomeLink, AuthPage } from "@/components/auth/auth-shell";
import { ttfsEvents } from "@/lib/analytics";
import { markOnboardingStepComplete } from "@/lib/onboarding/progress";
import { sanitizeRelativeRedirect } from "@/lib/security/redirect";
import { getErrorMessage } from "@/lib/ui-error";

function buildAuthHref(path: string, callbackUrl: string, extraParams?: Record<string, string>): string {
  const params = new URLSearchParams(extraParams);
  if (callbackUrl !== "/dashboard") {
    params.set("callbackUrl", callbackUrl);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export default function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = sanitizeRelativeRedirect(searchParams.get("callbackUrl"));
  const loginHref = buildAuthHref("/login", callbackUrl);
  const loginAfterSignupHref = buildAuthHref("/login", callbackUrl, {
    message: "Account created. Please sign in.",
  });
  const continueLabel = callbackUrl === "/dashboard" ? "Continue to Dashboard" : "Continue";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRequired = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  const buildExampleRequest = useCallback(
    (key: string) => `curl -X POST \\
  https://seizn.com/api/memories \\
  -H "x-api-key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Remember that I prefer concise onboarding flows.","memory_type":"preference"}'`,
    []
  );

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, turnstileToken }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(getErrorMessage(data.error, "Failed to create account"));
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      ttfsEvents.signupCompleted();

      if (data.apiKey) {
        setApiKey(data.apiKey);
        markOnboardingStepComplete("api_key");
        ttfsEvents.apiKeyCreated("Default Key");
        setIsLoading(false);
        return;
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        router.push(loginAfterSignupHref);
      } else {
        router.push(callbackUrl);
      }
    } catch {
      setError("An error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  const proceedToLogin = async () => {
    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (result?.error) {
      router.push(loginAfterSignupHref);
    } else {
      router.push(callbackUrl);
    }
  };

  const copyApiKey = async () => {
    if (apiKey) {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyExampleRequest = async () => {
    if (apiKey) {
      await navigator.clipboard.writeText(buildExampleRequest(apiKey));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOAuthSignup = (provider: string) => {
    setIsLoading(true);
    signIn(provider, { callbackUrl });
  };

  return (
    <AuthPage subtitle="Create your account">
      <AuthCard>
          {success && apiKey && (
            <div className="mb-6 space-y-4">
              <div className="auth-status auth-status-canon">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Account created successfully!
              </div>
              <div className="auth-section-card">
                <p className="auth-label">Your API Key</p>
                <div className="flex items-center gap-2">
                  <code className="auth-code flex-1 px-3 py-2 text-xs break-all">
                    {apiKey}
                  </code>
                  <button
                    onClick={copyApiKey}
                    className="auth-btn-primary px-3 py-2 rounded-md text-sm"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="auth-warning-text mt-3 flex items-center gap-1 text-xs">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Save this key securely. It will not be shown again.
                </p>
              </div>
              <div className="auth-section-card">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="auth-label mb-0">Example Request</p>
                    <p className="auth-body mt-1 text-xs">
                      Copy a working request and send your first memory right away.
                    </p>
                  </div>
                  <button
                    onClick={copyExampleRequest}
                    className="auth-btn-secondary px-3 py-2 rounded-md text-sm"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <pre className="auth-code auth-code-block">
                  <code>{buildExampleRequest(apiKey)}</code>
                </pre>
              </div>
              <button
                onClick={proceedToLogin}
                className="auth-btn-primary w-full rounded-md py-3.5 text-[15px] font-semibold"
              >
                {continueLabel}
              </button>
            </div>
          )}

          {success && !apiKey && (
            <div className="auth-status auth-status-canon mb-6">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Account created successfully! Signing you in...
            </div>
          )}

          {error && (
            <div className="auth-status auth-status-conflict mb-6">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {!apiKey && (
            <>
              <div className="space-y-3">
                <button
                  onClick={() => handleOAuthSignup("github")}
                  disabled={isLoading}
                  className="auth-btn-oauth-github w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md font-medium disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                  </svg>
                  Continue with GitHub
                </button>

                <button
                  onClick={() => handleOAuthSignup("google")}
                  disabled={isLoading}
                  className="auth-btn-secondary w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-md font-medium disabled:opacity-50"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>
              </div>

              <AuthDivider />

              <form onSubmit={handleSignup} className="space-y-4">
                <div>
                  <label htmlFor="signup-name" className="auth-label">Name</label>
                  <input
                    id="signup-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input-elegant w-full"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="auth-label">Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="input-elegant w-full"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="auth-label">Password</label>
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="input-elegant w-full"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="signup-confirm-password" className="auth-label">Confirm Password</label>
                  <input
                    id="signup-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    className="input-elegant w-full"
                    placeholder="Confirm your password"
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
                      Creating account...
                    </span>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </form>

              <p className="auth-body mt-4 text-center text-xs">
                By signing up, you agree to our{" "}
                <Link href="/en/legal/terms" className="auth-link">Terms of Service</Link>{" "}
                and{" "}
                <Link href="/en/legal/privacy" className="auth-link">Privacy Policy</Link>
              </p>

              <p className="auth-body mt-6 text-center">
                Already have an account?{" "}
                <Link href={loginHref} className="auth-link">
                  Sign in
                </Link>
              </p>
            </>
          )}
      </AuthCard>
      <AuthHomeLink />
    </AuthPage>
  );
}
