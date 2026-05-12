"use client";

import { FormEvent, useMemo, useState } from "react";
import type { Locale } from "@/i18n/config";

export interface DesignPartnerFormCopy {
  title: string;
  subtitle: string;
  fields: {
    companyName: string;
    contactName: string;
    email: string;
    role: string;
    website: string;
    gameTitle: string;
    teamSize: string;
    expectedMemoryVolume: string;
    useCase: string;
    liveTitle: string;
    feedbackCommitment: string;
    caseStudyCommitment: string;
  };
  placeholders: {
    companyName: string;
    contactName: string;
    email: string;
    role: string;
    website: string;
    gameTitle: string;
    teamSize: string;
    expectedMemoryVolume: string;
    useCase: string;
  };
  submit: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  errorFallback: string;
}

interface DesignPartnersFormProps {
  copy: DesignPartnerFormCopy;
  locale: Locale;
}

interface FormState {
  companyName: string;
  contactName: string;
  email: string;
  role: string;
  website: string;
  gameTitle: string;
  teamSize: string;
  expectedMemoryVolume: string;
  useCase: string;
  liveTitle: boolean;
  feedbackCommitment: boolean;
  caseStudyCommitment: boolean;
}

const INITIAL_STATE: FormState = {
  companyName: "",
  contactName: "",
  email: "",
  role: "",
  website: "",
  gameTitle: "",
  teamSize: "",
  expectedMemoryVolume: "",
  useCase: "",
  liveTitle: false,
  feedbackCommitment: false,
  caseStudyCommitment: false,
};

export function DesignPartnersForm({ copy, locale }: DesignPartnersFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const canSubmit = useMemo(
    () =>
      form.companyName.trim().length > 1 &&
      form.contactName.trim().length > 1 &&
      form.email.includes("@") &&
      form.useCase.trim().length >= 20 &&
      form.feedbackCommitment &&
      form.caseStudyCommitment,
    [form]
  );

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/design-partners/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, locale }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(typeof payload.error === "string" ? payload.error : copy.errorFallback);
      }

      setIsSubmitted(true);
      setForm(INITIAL_STATE);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.errorFallback);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="border-y border-szn-border-subtle bg-szn-signal-soft px-6 py-10">
        <div className="szn-section-number mb-4">APPLICATION RECEIVED</div>
        <h3 className="szn-serif text-[32px] leading-tight text-szn-text-1">{copy.successTitle}</h3>
        <p className="mt-4 max-w-xl text-[14px] leading-[1.65] text-szn-text-2">{copy.successBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-y border-szn-border-subtle bg-szn-bg">
      <div className="grid gap-px bg-szn-border-subtle md:grid-cols-2">
        <TextField
          label={copy.fields.companyName}
          value={form.companyName}
          placeholder={copy.placeholders.companyName}
          onChange={(value) => updateField("companyName", value)}
          required
        />
        <TextField
          label={copy.fields.contactName}
          value={form.contactName}
          placeholder={copy.placeholders.contactName}
          onChange={(value) => updateField("contactName", value)}
          required
        />
        <TextField
          label={copy.fields.email}
          value={form.email}
          placeholder={copy.placeholders.email}
          onChange={(value) => updateField("email", value)}
          type="email"
          required
        />
        <TextField
          label={copy.fields.role}
          value={form.role}
          placeholder={copy.placeholders.role}
          onChange={(value) => updateField("role", value)}
        />
        <TextField
          label={copy.fields.website}
          value={form.website}
          placeholder={copy.placeholders.website}
          onChange={(value) => updateField("website", value)}
          type="url"
        />
        <TextField
          label={copy.fields.gameTitle}
          value={form.gameTitle}
          placeholder={copy.placeholders.gameTitle}
          onChange={(value) => updateField("gameTitle", value)}
        />
        <TextField
          label={copy.fields.teamSize}
          value={form.teamSize}
          placeholder={copy.placeholders.teamSize}
          onChange={(value) => updateField("teamSize", value)}
        />
        <TextField
          label={copy.fields.expectedMemoryVolume}
          value={form.expectedMemoryVolume}
          placeholder={copy.placeholders.expectedMemoryVolume}
          onChange={(value) => updateField("expectedMemoryVolume", value)}
        />
      </div>

      <div className="border-b border-szn-border-subtle bg-szn-bg p-5">
        <label className="block">
          <span className="szn-eyebrow">{copy.fields.useCase}</span>
          <textarea
            value={form.useCase}
            onChange={(event) => updateField("useCase", event.target.value)}
            placeholder={copy.placeholders.useCase}
            rows={7}
            required
            className="mt-3 min-h-[180px] w-full resize-y border border-szn-border-subtle bg-szn-surface-1 px-4 py-3 text-[14px] leading-[1.6] text-szn-text-1 outline-none transition-colors placeholder:text-szn-text-3 focus:border-szn-signal"
          />
        </label>
      </div>

      <div className="grid gap-px bg-szn-border-subtle md:grid-cols-3">
        <CheckboxField
          label={copy.fields.liveTitle}
          checked={form.liveTitle}
          onChange={(value) => updateField("liveTitle", value)}
        />
        <CheckboxField
          label={copy.fields.feedbackCommitment}
          checked={form.feedbackCommitment}
          onChange={(value) => updateField("feedbackCommitment", value)}
          required
        />
        <CheckboxField
          label={copy.fields.caseStudyCommitment}
          checked={form.caseStudyCommitment}
          onChange={(value) => updateField("caseStudyCommitment", value)}
          required
        />
      </div>

      {error && (
        <div className="border-t border-red-500/30 bg-red-500/10 px-5 py-4 text-[13px] text-red-100">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-[12px] leading-[1.55] text-szn-text-3">{copy.subtitle}</p>
        <button type="submit" disabled={!canSubmit || isSubmitting} className="szn-btn-signal disabled:cursor-not-allowed disabled:opacity-50">
          {isSubmitting ? copy.submitting : copy.submit}
        </button>
      </div>
    </form>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block bg-szn-bg p-5">
      <span className="szn-eyebrow">{label}</span>
      <input aria-label="Value"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-3 h-12 w-full border border-szn-border-subtle bg-szn-surface-1 px-4 text-[14px] text-szn-text-1 outline-none transition-colors placeholder:text-szn-text-3 focus:border-szn-signal"
      />
    </label>
  );
}

function CheckboxField({
  label,
  checked,
  onChange,
  required = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  required?: boolean;
}) {
  return (
    <label className="flex min-h-[96px] items-start gap-3 bg-szn-bg p-5 text-[13px] leading-[1.55] text-szn-text-2">
      <input aria-label="Confirmation checkbox"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required={required}
        className="mt-0.5 h-4 w-4 accent-szn-signal"
      />
      <span>{label}</span>
    </label>
  );
}
