"use client";

import { useEffect, useMemo, useState } from "react";
import type { E2EProfileData } from "@/lib/memory/secure-memory-client";
import { secureMemory } from "@/lib/memory/secure-memory-client";

export type PinDialogMode = "setup" | "unlock";

export interface PinDialogProps {
  isOpen: boolean;
  mode: PinDialogMode;
  onClose: () => void;
  onSetupSuccess?: (data: E2EProfileData) => void;
  onUnlockSuccess?: () => void;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 0h10.5A2.25 2.25 0 0119.5 12.75v6A2.25 2.25 0 0117.25 21H6.75A2.25 2.25 0 014.5 18.75v-6A2.25 2.25 0 016.75 10.5z" />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function PinDialog({
  isOpen,
  mode,
  onClose,
  onSetupSuccess,
  onUnlockSuccess,
}: PinDialogProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [securityState, setSecurityState] = useState(secureMemory.getSecurityState());

  useEffect(() => {
    if (!isOpen) return;

    setPin("");
    setConfirmPin("");
    setError(null);
    setLoading(false);
    setSecurityState(secureMemory.getSecurityState());

    const interval = setInterval(() => {
      setSecurityState(secureMemory.getSecurityState());
    }, 250);

    return () => clearInterval(interval);
  }, [isOpen, mode]);

  const cooldownSeconds = useMemo(() => Math.ceil(securityState.cooldownRemainingMs / 1000), [securityState.cooldownRemainingMs]);
  const isCooldown = cooldownSeconds > 0;

  const canSubmit = useMemo(() => {
    if (loading) return false;
    if (isCooldown) return false;
    if (pin.length < 4 || pin.length > 6) return false;
    if (mode === "setup") {
      if (confirmPin.length < 4 || confirmPin.length > 6) return false;
      if (pin !== confirmPin) return false;
    }
    return true;
  }, [confirmPin, isCooldown, loading, mode, pin]);

  if (!isOpen) return null;

  const title = mode === "setup" ? "Set up PIN" : "Unlock encrypted memories";
  const subtitle =
    mode === "setup"
      ? "New confidential memories can be encrypted client-side."
      : "Enter your PIN to decrypt encrypted memories in this session.";

  const handleSubmit = async () => {
    setError(null);

    if (mode === "setup") {
      if (pin !== confirmPin) {
        setError("PINs do not match.");
        return;
      }
      setLoading(true);
      try {
        const result = await secureMemory.setup(pin);
        if (!result.ok) {
          if (result.reason === "invalid_pin") setError("PIN must be 4-6 digits.");
          else if (result.reason === "unauthorized") setError("Login required.");
          else if (result.reason === "plan_required") setError("E2E encryption is available on Starter plan or above.");
          else if (result.reason === "conflict") setError("PIN is already set up.");
          else setError("Failed to set up PIN. Please try again.");
          return;
        }
        onSetupSuccess?.(result.data);
        onClose();
      } finally {
        setLoading(false);
      }
      return;
    }

    // unlock
    setLoading(true);
    try {
      const result = await secureMemory.unlock(pin);
      if (!result.ok) {
        setSecurityState(secureMemory.getSecurityState());
        if (result.reason === "cooldown") {
          setError("Too many attempts. Please try again in a moment.");
        } else if (result.reason === "unauthorized") {
          setError("Login required.");
        } else if (result.reason === "not_setup") {
          setError("PIN is not set up for this account.");
        } else {
          setError("Incorrect PIN.");
        }
        return;
      }

      onUnlockSuccess?.();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={loading ? undefined : onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
              <LockIcon className="w-5 h-5 text-teal-700 dark:text-teal-300" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300">{subtitle}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Warning */}
          {mode === "setup" && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Important:</strong> This PIN cannot be recovered. If you forget it, encrypted memories are permanently lost.
              </p>
            </div>
          )}

          {mode === "unlock" && (
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                This unlock only lasts for the current session. Refreshing the page will lock again.
              </p>
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Attempts: {Math.min(securityState.failedAttempts, 3)}/3
                {isCooldown && <span className="ml-2 text-red-600 dark:text-red-400">Cooldown: {cooldownSeconds}s</span>}
              </div>
            </div>
          )}

          {/* PIN input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              PIN (4-6 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={pin}
              onChange={(e) => setPin(digitsOnly(e.target.value).slice(0, 6))}
              disabled={loading || isCooldown}
              className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 disabled:opacity-60"
              placeholder="1234"
            />
          </div>

          {mode === "setup" && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={confirmPin}
                onChange={(e) => setConfirmPin(digitsOnly(e.target.value).slice(0, 6))}
                disabled={loading}
                className="w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:focus:ring-teal-400 disabled:opacity-60"
                placeholder="1234"
              />
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {isCooldown && (
            <div className="text-sm text-gray-600 dark:text-gray-300">
              Please wait {cooldownSeconds}s before trying again.
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors"
            >
              {mode === "unlock" ? "Continue locked" : "Cancel"}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-medium hover:from-teal-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all inline-flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner className="w-4 h-4" />
                  {mode === "setup" ? "Setting up..." : "Unlocking..."}
                </>
              ) : (
                mode === "setup" ? "Set up PIN" : "Unlock"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
