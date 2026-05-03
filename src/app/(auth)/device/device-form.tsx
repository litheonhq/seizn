"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SeiznLockup } from "@/components/landing/brand-marks";
import { getErrorMessage } from "@/lib/ui-error";

type Step = "input" | "confirming" | "approved" | "denied" | "error" | "expired";

export default function DeviceForm() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [userCode, setUserCode] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--ink-50)", fontFamily: "var(--font-sans)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center">
            <SeiznLockup variant="graph" tone="dark" size="md" />
          </Link>
          <p className="mt-3 text-sm" style={{ color: "var(--ink-600)" }}>
            Authorize Device
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--ink-0)",
            border: "1px solid var(--ink-200)",
            boxShadow: "var(--shadow-md)",
            color: "var(--ink-900)",
          }}
        >
          {step === "input" && (
            <>
              <div className="text-center mb-6">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                  style={{ background: "var(--ink-50)", color: "var(--ink-900)" }}
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-900)" }}>Enter Device Code</h2>
                <p className="text-sm" style={{ color: "var(--ink-600)" }}>
                  Enter the code shown in your terminal or editor to authorize access to your Seizn account.
                </p>
              </div>

              {errorMsg && (
                <div
                  className="mb-4 p-3 rounded-md text-sm flex items-center gap-2"
                  style={{
                    background: "var(--signal-conflict-soft)",
                    border: "1px solid var(--signal-conflict)",
                    color: "var(--signal-conflict-ink)",
                  }}
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
                  className="auth-btn-primary w-full py-3.5 rounded-md font-semibold disabled:opacity-50"
                  style={{ fontSize: "15px" }}
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
                <p className="mt-4 text-center text-xs" style={{ color: "var(--ink-500)" }}>
                  You&apos;ll be asked to sign in first.
                </p>
              )}
            </>
          )}

          {/* Step: Confirm approval */}
          {step === "confirming" && (
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "var(--signal-pending-soft)", color: "var(--signal-pending-ink)" }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-900)" }}>Confirm Device Access</h2>
              <p className="text-sm mb-2" style={{ color: "var(--ink-600)" }}>
                A device or application is requesting access to your Seizn account.
              </p>
              <div
                className="inline-block px-4 py-2 rounded-md text-lg tracking-widest mb-6"
                style={{
                  background: "var(--ink-50)",
                  color: "var(--ink-900)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {userCode}
              </div>
              <p className="text-xs mb-6" style={{ color: "var(--ink-500)" }}>
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
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "var(--signal-canon-soft)", color: "var(--signal-canon-ink)" }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-900)" }}>Device Authorized</h2>
              <p className="text-sm mb-6" style={{ color: "var(--ink-600)" }}>
                Your device has been authorized. You can close this window and return to your terminal or editor.
              </p>
              <Link
                href="/dashboard"
                className="font-medium text-sm transition-colors"
                style={{ color: "var(--ink-900)", textDecoration: "underline" }}
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {/* Step: Denied */}
          {step === "denied" && (
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "var(--signal-conflict-soft)", color: "var(--signal-conflict-ink)" }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-900)" }}>Access Denied</h2>
              <p className="text-sm mb-6" style={{ color: "var(--ink-600)" }}>
                The device request has been denied. If you didn&apos;t initiate this, your account is safe.
              </p>
              <button
                onClick={() => { setStep("input"); setUserCode(""); setErrorMsg(null); }}
                className="font-medium text-sm transition-colors"
                style={{ color: "var(--ink-900)", textDecoration: "underline" }}
              >
                Try Another Code
              </button>
            </div>
          )}

          {/* Step: Expired */}
          {step === "expired" && (
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "var(--signal-conflict-soft)", color: "var(--signal-conflict-ink)" }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-900)" }}>Code Expired</h2>
              <p className="text-sm mb-6" style={{ color: "var(--ink-600)" }}>
                This code has expired. Please generate a new code from your terminal or editor.
              </p>
              <button
                onClick={() => { setStep("input"); setUserCode(""); setErrorMsg(null); }}
                className="font-medium text-sm transition-colors"
                style={{ color: "var(--ink-900)", textDecoration: "underline" }}
              >
                Enter New Code
              </button>
            </div>
          )}

          {/* Step: Error */}
          {step === "error" && (
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: "var(--signal-conflict-soft)", color: "var(--signal-conflict-ink)" }}
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--ink-900)" }}>Something Went Wrong</h2>
              <p className="text-sm mb-6" style={{ color: "var(--ink-600)" }}>{errorMsg || "An unexpected error occurred."}</p>
              <button
                onClick={() => { setStep("input"); setErrorMsg(null); }}
                className="font-medium text-sm transition-colors"
                style={{ color: "var(--ink-900)", textDecoration: "underline" }}
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center">
          <Link href="/" className="text-sm flex items-center justify-center gap-1 transition-colors" style={{ color: "var(--ink-500)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
