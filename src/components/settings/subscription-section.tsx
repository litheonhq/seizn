"use client";

import { CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import type { AuthorSettingsCopy, SubscriptionState } from "./author-settings-types";
import { formatDate } from "./author-settings-types";
import type { Locale } from "@/i18n/config";
import {
  getAuthorTierConfig,
  getBillingCadenceFromStripePriceId,
  isAuthorBillingTier,
  type BillingCadence,
} from "@/lib/stripe-config";

interface SubscriptionSectionProps {
  subscription: SubscriptionState;
  copy: AuthorSettingsCopy["subscription"];
  locale: Locale;
  action: "idle" | "portal";
  onManageBilling: () => Promise<void>;
}

export function SubscriptionSection({
  subscription,
  copy,
  locale,
  action,
  onManageBilling,
}: SubscriptionSectionProps) {
  const planKey = (subscription.tier ?? subscription.plan ?? "free").toLowerCase();
  const cadence = resolveBillingCadence(subscription);
  const planPrice = formatPlanPrice(planKey, cadence);
  const cadenceNote = isAuthorBillingTier(planKey) && cadence === "yearly"
    ? "Saves about 15% yearly"
    : null;
  const trialText =
    typeof subscription.trial_days_remaining === "number"
      ? `${subscription.trial_days_remaining}d`
      : copy.noTrial;

  return (
    <section className="rounded-lg border border-[var(--ink-200)] bg-[var(--ink-0)] p-5" aria-labelledby="author-settings-subscription">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[var(--ink-900)]" aria-hidden="true" />
            <h2 id="author-settings-subscription" className="text-lg font-semibold text-[var(--ink-900)]">
              {copy.title}
            </h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--ink-600)]">{copy.description}</p>
        </div>
        <button
          type="button"
          onClick={onManageBilling}
          disabled={action !== "idle"}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[var(--ink-900)] px-4 text-sm font-medium text-white hover:bg-[var(--ink-900)]/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {action === "portal" ? copy.opening : copy.manage}
        </button>
      </div>

      {subscription.payment_failed ? (
        <div className="mt-5 flex items-start gap-2 rounded-md border border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] p-3 text-sm text-[var(--signal-conflict-ink)]">
          <TriangleAlert className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{copy.paymentFailed}</span>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.currentPlan}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {subscription.tier_label} {planPrice ? ` - ${planPrice}` : ""}
          </dd>
          {cadenceNote ? (
            <dd className="mt-1 text-xs text-[var(--ink-500)]">{cadenceNote}</dd>
          ) : null}
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.status}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{subscription.status}</dd>
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.trial}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{trialText}</dd>
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.renews}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {formatDate(subscription.renews_at ?? subscription.current_period_end, locale)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function resolveBillingCadence(subscription: SubscriptionState): BillingCadence {
  if (subscription.billing_cadence === "monthly" || subscription.billing_cadence === "yearly") {
    return subscription.billing_cadence;
  }

  if (subscription.stripe_price_id) {
    return getBillingCadenceFromStripePriceId(subscription.stripe_price_id) ?? "monthly";
  }

  return "monthly";
}

function formatPlanPrice(planKey: string, cadence: BillingCadence): string {
  if (planKey === "free") return "$0";
  if (!isAuthorBillingTier(planKey)) return "";

  const config = getAuthorTierConfig(planKey);
  const amount = cadence === "yearly" ? config.yearlyUsd : config.monthlyUsd;
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return cadence === "yearly" ? `${formatted} per year` : `${formatted}/mo`;
}
