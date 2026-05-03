"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard, AuthHomeLink, AuthPage } from "@/components/auth/auth-shell";
import { getErrorMessage } from "@/lib/ui-error";

type Step = "input" | "confirming" | "approved" | "denied" | "error" | "expired";

export default function DeviceForm() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [userCode, setUserCode] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  // Auto-format: insert dash after 4 chars
  const handleCodeChange = (val: string) => {
    const raw = val.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length <= 4) {
      setUserCode(raw);
    } else {
      setUserCode(raw.slice(0, 4) + "-" + raw.slice(4, 8));
    }
  };

  // Look up the user code
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userCode.length < 9) return; // ABCD-1234 = 9 chars

    if (isAuthenticated === false) {
      router.push(`/login?callbackUrl=${encodeURIComponent("/auth/device?code=" + userCode)}`);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/auth/device/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: userCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "expired") {
          setStep("expired");
        } else {
          setErrorMsg(getErrorMessage(data.error, "Invalid code. Please check and try again."));
        }
        setIsLoading(false);
        return;
      }

      setStep("confirming");
    } catch {
      setErrorMsg("Network error. Please try again.");
    }
    setIsLoading(false);
  };

  // Approve the device
  const handleApprove = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: userCode, action: "approve" }),
      });

      if (res.ok) {
        setStep("approved");
      } else {
        const data = await res.json();
        setErrorMsg(getErrorMessage(data.error, "Failed to approve."));
        setStep("error");
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setStep("error");
    }
    setIsLoading(false);
  };

  // Deny the device
  const handleDeny = async () => {
    setIsLoading(true);
    try {
      await fetch("/api/auth/device/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_code: userCode, action: "deny" }),
      });
      setStep("denied");
    } catch {
      setErrorMsg("Network error.");
    }
    setIsLoading(false);
  };

  // Check auth status + pre-fill code from URL param
  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => setIsAuthenticated(!!data?.user))
      .catch(() => setIsAuthenticated(false));

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    let codeTimeout: ReturnType<typeof setTimeout> | undefined;
    if (code) {
      codeTimeout = setTimeout(() => handleCodeChange(code), 0);
    }

    return () => {
      if (codeTimeout) clearTimeout(codeTimeout);
    };
  }, []);

  useEffect(() => {
    if (step === "input") {
      codeInputRef.current?.focus();
      return;
    }

    statusRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === "input" && errorMsg) {
      statusRef.current?.focus();
    }
  }, [errorMsg, step]);

  return (
    <AuthPage subtitle="Authorize Device">
      <AuthCard>
          {step === "input" && (
            <>
              <div className="text-center mb-6">
                <div className="auth-icon auth-icon-ink">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="auth-heading">Enter Device Code</h2>
                <p className="auth-body">
                  Enter the code shown in your terminal or editor to authorize access to your Seizn account.
                </p>
              </div>

              {errorMsg && (
                <div
                  ref={statusRef}
                  role="alert"
                  aria-live="assertive"
                  tabIndex={-1}
                  className="auth-status auth-status-compact auth-status-conflict mb-4"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleLookup}>
                <div className="mb-6">
                  <input
                    ref={codeInputRef}
                    type="text"
                    value={userCode}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="ABCD-1234"
                    maxLength={9}
                    className="input-elegant w-full text-center text-2xl tracking-[0.3em] font-mono uppercase"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || userCode.length < 9}
                  className="auth-btn-primary w-full rounded-md py-3.5 text-[15px] font-semibold disabled:opacity-50"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Verifying...
                    </span>
                  ) : isAuthenticated === false ? (
                    "Sign in & Verify"
                  ) : (
                    "Verify Code"
                  )}
                </button>
              </form>

              {isAuthenticated === false && (
                <p className="auth-muted mt-4 text-center text-xs">
                  You&apos;ll be asked to sign in first.
                </p>
              )}
            </>
          )}

          {/* Step: Confirm approval */}
          {step === "confirming" && (
            <div ref={statusRef} role="status" aria-live="polite" tabIndex={-1} className="text-center">
              <div className="auth-icon auth-icon-pending">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="auth-heading">Confirm Device Access</h2>
              <p className="auth-body mb-2">
                A device or application is requesting access to your Seizn account.
              </p>
              <div className="auth-code auth-code-inline mb-6">
                {userCode}
              </div>
              <p className="auth-muted mb-6 text-xs">
                Only approve if you initiated this request from your terminal or editor.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeny}
                  disabled={isLoading}
                  className="auth-btn-secondary flex-1 py-3 rounded-md font-medium disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="auth-btn-primary flex-1 py-3 rounded-md font-semibold disabled:opacity-50"
                >
                  {isLoading ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          )}

          {/* Step: Approved */}
          {step === "approved" && (
            <div ref={statusRef} role="status" aria-live="polite" tabIndex={-1} className="text-center">
              <div className="auth-icon auth-icon-canon">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="auth-heading">Device Authorized</h2>
              <p className="auth-body mb-6">
                Your device has been authorized. You can close this window and return to your terminal or editor.
              </p>
              <Link
                href="/dashboard"
                className="auth-link text-sm"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {/* Step: Denied */}
          {step === "denied" && (
            <div ref={statusRef} role="status" aria-live="polite" tabIndex={-1} className="text-center">
              <div className="auth-icon auth-icon-conflict">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="auth-heading">Access Denied</h2>
              <p className="auth-body mb-6">
                The device request has been denied. If you didn&apos;t initiate this, your account is safe.
              </p>
              <button
                onClick={() => { setStep("input"); setUserCode(""); setErrorMsg(null); }}
                className="auth-link text-sm"
              >
                Try Another Code
              </button>
            </div>
          )}

          {/* Step: Expired */}
          {step === "expired" && (
            <div ref={statusRef} role="alert" aria-live="assertive" tabIndex={-1} className="text-center">
              <div className="auth-icon auth-icon-conflict">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="auth-heading">Code Expired</h2>
              <p className="auth-body mb-6">
                This code has expired. Please generate a new code from your terminal or editor.
              </p>
              <button
                onClick={() => { setStep("input"); setUserCode(""); setErrorMsg(null); }}
                className="auth-link text-sm"
              >
                Enter New Code
              </button>
            </div>
          )}

          {/* Step: Error */}
          {step === "error" && (
            <div ref={statusRef} role="alert" aria-live="assertive" tabIndex={-1} className="text-center">
              <div className="auth-icon auth-icon-conflict">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="auth-heading">Something Went Wrong</h2>
              <p className="auth-body mb-6">{errorMsg || "An unexpected error occurred."}</p>
              <button
                onClick={() => { setStep("input"); setErrorMsg(null); }}
                className="auth-link text-sm"
              >
                Try Again
              </button>
            </div>
          )}
      </AuthCard>
      <AuthHomeLink />
    </AuthPage>
  );
}
