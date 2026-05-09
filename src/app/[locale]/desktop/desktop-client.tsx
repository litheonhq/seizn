"use client";

import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { Locale } from "@/i18n/config";
import { LandingNav } from "@/components/shared/site-nav";

interface DesktopCopy {
  hero: { badge: string; title: string; subtitle: string; releaseTarget: string };
  benefits: { title: string; items: Array<{ title: string; body: string }> };
  preview: { title: string; items: Array<{ title: string; body: string }> };
  waitlist: {
    title: string;
    subtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    submitLabel: string;
    submittingLabel: string;
    successHeadline: string;
    successBody: string;
    errorGeneric: string;
    errorRateLimited: string;
    errorInvalidEmail: string;
  };
}

interface DesktopClientProps {
  locale: Locale;
  dict: Dictionary;
}

const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function DesktopClient({ locale, dict }: DesktopClientProps) {
  const copy = (dict as unknown as { desktopPage: DesktopCopy }).desktopPage;
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "submitting" || status === "success") return;

    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setStatus("error");
      setErrorMessage(copy.waitlist.errorInvalidEmail);
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const response = await fetch("/api/waitlist/desktop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          locale: locale === "ko" ? "ko" : "en",
          source_utm:
            typeof window !== "undefined"
              ? Object.fromEntries(new URL(window.location.href).searchParams.entries())
              : null,
        }),
      });

      if (response.status === 429) {
        setStatus("error");
        setErrorMessage(copy.waitlist.errorRateLimited);
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(copy.waitlist.errorGeneric);
        return;
      }

      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
      setErrorMessage(copy.waitlist.errorGeneric);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--ink-0)", color: "var(--ink-900)" }}>
      <LandingNav locale={locale} />

      {/* Hero */}
      <section className="border-b" style={{ borderColor: "var(--ink-100)" }}>
        <div className="author-shell py-20 sm:py-28">
          <div className="max-w-3xl">
            <div
              className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide"
              style={{ borderColor: "var(--ink-200)", color: "var(--ink-600)" }}
            >
              {copy.hero.badge}
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl" style={{ color: "var(--ink-900)" }}>
              {copy.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-7" style={{ color: "var(--ink-600)" }}>
              {copy.hero.subtitle}
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--ink-500)" }}>
              {copy.hero.releaseTarget}
            </p>
          </div>
        </div>
      </section>

      {/* Preview — what's different */}
      <section className="author-section">
        <div className="author-shell">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
            {copy.preview.title}
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {copy.preview.items.map((item) => (
              <article
                key={item.title}
                className="rounded-[var(--radius-md)] border p-6"
                style={{ borderColor: "var(--ink-100)", background: "var(--ink-0)" }}
              >
                <h3 className="text-base font-medium" style={{ color: "var(--ink-900)" }}>
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits + Waitlist */}
      <section className="author-section" style={{ background: "var(--ink-50)" }}>
        <div className="author-shell">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--ink-900)" }}>
                {copy.benefits.title}
              </h2>
              <ul className="mt-8 space-y-4">
                {copy.benefits.items.map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <Check size={18} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--ink-900)", marginTop: 3, flexShrink: 0 }} />
                    <div>
                      <h3 className="text-base font-medium" style={{ color: "var(--ink-900)" }}>
                        {item.title}
                      </h3>
                      <p className="mt-1 text-sm leading-6" style={{ color: "var(--ink-600)", textWrap: "pretty" }}>
                        {item.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="rounded-[var(--radius-lg)] border p-8"
              style={{ borderColor: "var(--ink-200)", background: "var(--ink-0)" }}
            >
              <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--ink-900)" }}>
                {copy.waitlist.title}
              </h2>
              <p className="mt-2 text-sm" style={{ color: "var(--ink-600)" }}>
                {copy.waitlist.subtitle}
              </p>

              <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3" noValidate>
                <label htmlFor="desktop-waitlist-email" className="text-sm font-medium" style={{ color: "var(--ink-900)" }}>
                  {copy.waitlist.emailLabel}
                </label>
                <input
                  id="desktop-waitlist-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={copy.waitlist.emailPlaceholder}
                  required
                  disabled={status === "submitting" || status === "success"}
                  className="rounded-[var(--radius-md)] border px-4 py-3 text-sm"
                  style={{
                    borderColor: status === "error" ? "var(--signal-conflict)" : "var(--ink-200)",
                    background: "var(--ink-0)",
                    color: "var(--ink-900)",
                  }}
                />
                <button
                  type="submit"
                  disabled={status === "submitting" || status === "success"}
                  className="rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    background: status === "success" ? "var(--signal-canon)" : "var(--ink-900)",
                    color: "var(--ink-0)",
                    cursor: status === "submitting" || status === "success" ? "not-allowed" : "pointer",
                  }}
                >
                  {status === "submitting"
                    ? copy.waitlist.submittingLabel
                    : status === "success"
                      ? "✓"
                      : copy.waitlist.submitLabel}
                </button>

                {status === "success" ? (
                  <div
                    className="mt-2 rounded-md p-3 text-sm"
                    style={{ background: "var(--signal-canon-soft)", color: "var(--signal-canon-ink)" }}
                  >
                    <p className="font-medium">{copy.waitlist.successHeadline}</p>
                    <p className="mt-1">{copy.waitlist.successBody}</p>
                  </div>
                ) : null}

                {status === "error" && errorMessage ? (
                  <div
                    className="mt-2 rounded-md p-3 text-sm"
                    style={{ background: "var(--signal-conflict-soft, oklch(0.96 0.04 25))", color: "var(--signal-conflict-ink, oklch(0.35 0.16 25))" }}
                    role="alert"
                  >
                    {errorMessage}
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
