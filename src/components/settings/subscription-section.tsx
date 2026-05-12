"use client";

import { CreditCard, ExternalLink, TriangleAlert } from "lucide-react";
import type { AuthorSettingsCopy, SubscriptionState } from "./author-settings-types";
import { formatDate } from "./author-settings-types";
import type { Locale } from "@/i18n/config";
import {
  getAuthorTierConfig,
  getBillingCadenceFromStripePriceId,
  getBillingColumnFromStripePriceId,
  getCharterStatusFromStripePriceId,
  isAuthorBillingTier,
  type BillingColumn,
  type BillingCadence,
  type CharterStatus,
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
  const priceDisplay = resolvePriceDisplay(planKey, subscription);
  const track2 = subscription.track2 ?? null;
  const statusLabel = track2 ? track2.status : subscription.status;
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
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--ink-900)] px-4 text-sm font-medium text-white hover:bg-[var(--ink-900)]/90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {action === "portal" ? copy.opening : copy.manage}
        </button>
      </div>

      {subscription.payment_failed || track2?.payment_failed ? (
        <div className="mt-5 flex items-start gap-2 rounded-md border border-[var(--signal-conflict)] bg-[var(--signal-conflict-soft)] p-3 text-sm text-[var(--signal-conflict-ink)]">
          <TriangleAlert className="mt-0.5 h-4 w-4" aria-hidden="true" />
          <span>{copy.paymentFailed}</span>
        </div>
      ) : null}

      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">
            {track2 ? "Web (Author Memory)" : copy.currentPlan}
          </dt>
          <dd className="mt-1 break-words text-sm font-semibold text-[var(--ink-900)]">
            {subscription.tier_label} {priceDisplay.price ? ` - ${priceDisplay.price}` : ""}
          </dd>
          {priceDisplay.note ? (
            <dd className="mt-1 text-xs text-[var(--ink-500)]">{priceDisplay.note}</dd>
          ) : null}
        </div>
        {track2 ? (
          <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
            <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">API · MCP</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-[var(--ink-900)]">
              {track2.tier_label} {track2.price_label ? ` - ${track2.price_label}` : ""}
            </dd>
            <dd className="mt-1 text-xs text-[var(--ink-500)]">{formatTrack2Quota(track2)}</dd>
          </div>
        ) : null}
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.status}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{statusLabel}</dd>
          {track2 ? <dd className="mt-1 text-xs text-[var(--ink-500)]">API · MCP subscription</dd> : null}
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.trial}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">{trialText}</dd>
        </div>
        <div className="rounded-md border border-[var(--ink-200)] bg-[var(--ink-50)] p-3">
          <dt className="text-xs font-medium uppercase text-[var(--ink-500)]">{copy.renews}</dt>
          <dd className="mt-1 text-sm font-semibold text-[var(--ink-900)]">
            {formatDate(track2?.renews_at ?? track2?.current_period_end ?? subscription.renews_at ?? subscription.current_period_end, locale)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function formatTrack2Quota(track2: NonNullable<SubscriptionState["track2"]>): string {
  const period = track2.quota.period === "day" ? "day" : "mo";
  return `${track2.quota.calls.toLocaleString("en")} calls/${period} · ${track2.quota.rate_limit_per_minute.toLocaleString("en")}/min`;
}

interface PriceDisplay {
  price: string;
  note: string | null;
}

function resolvePriceDisplay(planKey: string, subscription: SubscriptionState): PriceDisplay {
  if (planKey === "free") return { price: "$0", note: null };
  if (!isAuthorBillingTier(planKey)) return { price: "", note: null };

  const config = getAuthorTierConfig(planKey);
  const cadence = resolveBillingCadence(subscription);
  const column = resolveBillingColumn(subscription);
  const charter = resolveCharterStatus(subscription);
  const amount = resolveTierAmount(config, column, cadence, charter);
  if (amount === null) return { price: "", note: null };

  const price = `${formatUsd(amount)}${cadence === "yearly" ? " per year" : "/mo"}`;
  const note = cadence === "yearly" ? resolveYearlySavingsNote(config, column, amount) : null;
  return { price, note };
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

function resolveBillingColumn(subscription: SubscriptionState): BillingColumn {
  if (subscription.stripe_price_id) {
    const column = getBillingColumnFromStripePriceId(subscription.stripe_price_id);
    if (column) return column;
  }
  return subscription.byok_active ? "byok" : "managed";
}

function resolveCharterStatus(subscription: SubscriptionState): CharterStatus {
  if (subscription.stripe_price_id) {
    const charter = getCharterStatusFromStripePriceId(subscription.stripe_price_id);
    if (charter) return charter;
  }
  return "regular";
}

type TierConfig = ReturnType<typeof getAuthorTierConfig>;

function resolveTierAmount(
  config: TierConfig,
  column: BillingColumn,
  cadence: BillingCadence,
  charter: CharterStatus,
): number | null {
  if (column === "byok") {
    if (cadence === "yearly") {
      return charter === "charter" ? config.byokAnnualCharterUsd : config.byokAnnualUsd;
    }
    return charter === "charter" ? config.byokMonthlyCharterUsd : config.byokMonthlyUsd;
  }

  if (cadence === "yearly") {
    return charter === "charter" ? config.managedAnnualCharterUsd : config.managedAnnualUsd;
  }
  return charter === "charter" ? config.managedMonthlyCharterUsd : config.managedMonthlyUsd;
}

function resolveYearlySavingsNote(
  config: TierConfig,
  column: BillingColumn,
  yearlyAmount: number,
): string | null {
  const monthlyRegular = column === "byok" ? config.byokMonthlyUsd : config.managedMonthlyUsd;
  if (monthlyRegular === null) return null;
  const annualizedMonthly = monthlyRegular * 12;
  if (annualizedMonthly <= 0 || yearlyAmount >= annualizedMonthly) return null;
  const savingsPercent = Math.round(((annualizedMonthly - yearlyAmount) / annualizedMonthly) * 100);
  return savingsPercent > 0 ? `Saves about ${savingsPercent}% yearly` : null;
}

function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
