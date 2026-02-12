"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Step = "input" | "confirming" | "approved" | "denied" | "error" | "expired";

export default function DeviceForm() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  const [userCode, setUserCode] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<{ device_code: string } | null>(null);

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
          setErrorMsg(data.error || "Invalid code. Please check and try again.");
        }
        setIsLoading(false);
        return;
      }

      setDeviceInfo(data);
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
        setErrorMsg(data.error || "Failed to approve.");
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
    if (code) {
      handleCodeChange(code);
    }
  }, []);

  return (
    <div className="min-h-screen gradient-hero relative overflow-hidden flex items-center justify-center p-4">
      {/* Decorative */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-emerald-200/30 rounded-full blur-3xl animate-float" />
        <div className="absolute top-40 right-20 w-96 h-96 bg-cyan-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "2s" }} />
        <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-teal-200/20 rounded-full blur-3xl animate-float" style={{ animationDelay: "4s" }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <div className="w-10 h-10 bg-gradient-to-br from-pink-500 via-purple-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg group-hover:shadow-xl group-hover:scale-105 transition-all duration-300">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
              Seizn
            </span>
          </Link>
          <p className="text-gray-500 mt-3">Authorize Device</p>
        </div>

        {/* Card */}
        <div className="glass-card-premium rounded-3xl p-8 shadow-xl">
          {/* Step: Input user code */}
          {step === "input" && (
            <>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Enter Device Code</h2>
                <p className="text-gray-500 text-sm">
                  Enter the code shown in your terminal or editor to authorize access to your Seizn account.
                </p>
              </div>

              {errorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm flex items-center gap-2">
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
                  className="w-full py-3.5 btn-premium bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl"
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
                <p className="mt-4 text-center text-gray-400 text-xs">
                  You&apos;ll be asked to sign in first.
                </p>
              )}
            </>
          )}

          {/* Step: Confirm approval */}
          {step === "confirming" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Confirm Device Access</h2>
              <p className="text-gray-500 text-sm mb-2">
                A device or application is requesting access to your Seizn account.
              </p>
              <div className="inline-block px-4 py-2 bg-gray-100 rounded-lg font-mono text-lg tracking-widest mb-6">
                {userCode}
              </div>
              <p className="text-gray-400 text-xs mb-6">
                Only approve if you initiated this request from your terminal or editor.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeny}
                  disabled={isLoading}
                  className="flex-1 py-3 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  onClick={handleApprove}
                  disabled={isLoading}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
                >
                  {isLoading ? "Approving..." : "Approve"}
                </button>
              </div>
            </div>
          )}

          {/* Step: Approved */}
          {step === "approved" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Device Authorized</h2>
              <p className="text-gray-500 text-sm mb-6">
                Your device has been authorized. You can close this window and return to your terminal or editor.
              </p>
              <Link
                href="/dashboard"
                className="text-emerald-600 hover:text-emerald-500 font-medium text-sm transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          )}

          {/* Step: Denied */}
          {step === "denied" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Access Denied</h2>
              <p className="text-gray-500 text-sm mb-6">
                The device request has been denied. If you didn&apos;t initiate this, your account is safe.
              </p>
              <button
                onClick={() => { setStep("input"); setUserCode(""); setErrorMsg(null); }}
                className="text-emerald-600 hover:text-emerald-500 font-medium text-sm transition-colors"
              >
                Try Another Code
              </button>
            </div>
          )}

          {/* Step: Expired */}
          {step === "expired" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Code Expired</h2>
              <p className="text-gray-500 text-sm mb-6">
                This code has expired. Please generate a new code from your terminal or editor.
              </p>
              <button
                onClick={() => { setStep("input"); setUserCode(""); setErrorMsg(null); }}
                className="text-emerald-600 hover:text-emerald-500 font-medium text-sm transition-colors"
              >
                Enter New Code
              </button>
            </div>
          )}

          {/* Step: Error */}
          {step === "error" && (
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Something Went Wrong</h2>
              <p className="text-gray-500 text-sm mb-6">{errorMsg || "An unexpected error occurred."}</p>
              <button
                onClick={() => { setStep("input"); setErrorMsg(null); }}
                className="text-emerald-600 hover:text-emerald-500 font-medium text-sm transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Back to home */}
        <p className="mt-6 text-center">
          <Link href="/" className="text-gray-400 hover:text-gray-600 text-sm flex items-center justify-center gap-1 transition-colors">
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
