"use client";

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

// ============================================
// Types
// ============================================

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  exiting?: boolean;
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void;
}

// ============================================
// Context
// ============================================

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

// ============================================
// Provider
// ============================================

const DISMISS_MS = 4000;
const EXIT_MS = 300;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, EXIT_MS);
  }, []);

  const toast = useCallback(
    (type: ToastType, message: string) => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => dismiss(id), DISMISS_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-atomic="false"
          className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role="status"
              style={{ animation: t.exiting ? `toast-out ${EXIT_MS}ms ease-in forwards` : `toast-in ${EXIT_MS}ms ease-out` }}
              className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm ${variantStyles[t.type]}`}
            >
              <span className="text-sm flex-1">{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="text-current opacity-50 hover:opacity-100 transition-opacity flex-shrink-0"
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ============================================
// Styles
// ============================================

const variantStyles: Record<ToastType, string> = {
  success: "bg-[var(--ink-0)] border-l-4 border-l-szn-success border-[var(--ink-200)] text-[var(--ink-900)]",
  error: "bg-[var(--ink-0)] border-l-4 border-l-szn-danger border-[var(--ink-200)] text-[var(--ink-900)]",
  warning: "bg-[var(--ink-0)] border-l-4 border-l-szn-warning border-[var(--ink-200)] text-[var(--ink-900)]",
  info: "bg-[var(--ink-0)] border-l-4 border-l-szn-accent border-[var(--ink-200)] text-[var(--ink-900)]",
};
