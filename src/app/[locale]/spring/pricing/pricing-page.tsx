"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/config";
import Link from "next/link";

interface PricingPageProps {
  locale: Locale;
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
  } | null;
}

type BillingPeriod = "monthly" | "yearly";
type Plan = "free" | "starter" | "plus" | "pro" | "enterprise";

interface PlanDetails {
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  limits: {
    gpt4oMini: string;
    gpt4o: string;
    claude: string;
    sdImages: string;
    dalleImages: string;
    files: string;
  };
  highlight?: boolean;
}

const PLANS: Record<Plan, PlanDetails> = {
  free: {
    name: "Free",
    description: "Perfect for trying out Spring",
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: [
      "50 GPT-4o Mini messages/day",
      "20 Gemini messages/day",
      "5 SD images/day",
      "3 file analyses/day",
      "Basic memory integration",
    ],
    limits: {
      gpt4oMini: "50/day",
      gpt4o: "-",
      claude: "-",
      sdImages: "5/day",
      dalleImages: "-",
      files: "3/day",
    },
  },
  starter: {
    name: "Starter",
    description: "For individuals getting started",
    monthlyPrice: 9.99,
    yearlyPrice: 99,
    features: [
      "200 GPT-4o Mini messages/day",
      "50 GPT-4o messages/day",
      "50 Claude Sonnet messages/day",
      "30 SD images/day",
      "10 DALL-E images/day",
      "20 file analyses/day",
      "Full memory integration",
    ],
    limits: {
      gpt4oMini: "200/day",
      gpt4o: "50/day",
      claude: "50/day",
      sdImages: "30/day",
      dalleImages: "10/day",
      files: "20/day",
    },
  },
  plus: {
    name: "Plus",
    description: "For power users",
    monthlyPrice: 19.99,
    yearlyPrice: 199,
    highlight: true,
    features: [
      "500 GPT-4o Mini messages/day",
      "150 GPT-4o messages/day",
      "20 GPT-5 messages/day",
      "150 Claude Sonnet messages/day",
      "100 SD images/day",
      "30 DALL-E images/day",
      "50 file analyses/day",
      "Priority support",
    ],
    limits: {
      gpt4oMini: "500/day",
      gpt4o: "150/day",
      claude: "150/day",
      sdImages: "100/day",
      dalleImages: "30/day",
      files: "50/day",
    },
  },
  pro: {
    name: "Pro",
    description: "For professionals and teams",
    monthlyPrice: 39.99,
    yearlyPrice: 399,
    features: [
      "1000 GPT-4o Mini messages/day",
      "300 GPT-4o messages/day",
      "50 GPT-5 messages/day",
      "300 Claude Sonnet messages/day",
      "50 Claude Opus messages/day",
      "300 SD images/day",
      "100 DALL-E images/day",
      "100 file analyses/day",
      "API access",
      "Priority support",
    ],
    limits: {
      gpt4oMini: "1000/day",
      gpt4o: "300/day",
      claude: "300/day",
      sdImages: "300/day",
      dalleImages: "100/day",
      files: "100/day",
    },
  },
  enterprise: {
    name: "Enterprise",
    description: "For large organizations",
    monthlyPrice: 99.99,
    yearlyPrice: 999,
    features: [
      "Unlimited messages",
      "Unlimited image generation",
      "Unlimited file analysis",
      "Custom model fine-tuning",
      "Dedicated support",
      "SLA guarantee",
      "SSO integration",
      "Custom integrations",
    ],
    limits: {
      gpt4oMini: "Unlimited",
      gpt4o: "Unlimited",
      claude: "Unlimited",
      sdImages: "Unlimited",
      dalleImages: "Unlimited",
      files: "Unlimited",
    },
  },
};

export function PricingPage({ locale, user }: PricingPageProps) {
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const [isLoading, setIsLoading] = useState<string | null>(null);

  const handleSubscribe = async (plan: Plan) => {
    if (!user) {
      window.location.href = `/${locale}/login?callbackUrl=/${locale}/spring/pricing`;
      return;
    }

    if (plan === "free") return;
    if (plan === "enterprise") {
      window.location.href = "mailto:enterprise@seizn.com?subject=Spring Enterprise Inquiry";
      return;
    }

    setIsLoading(plan);

    try {
      const res = await fetch("/api/spring/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billing }),
      });

      if (res.ok) {
        const data = await res.json();
        window.location.href = data.checkout_url;
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create checkout");
      }
    } catch (error) {
      console.error("Subscription error:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href={`/${locale}/spring/chat`} className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-rose-500 rounded-lg flex items-center justify-center">
                <span className="text-white text-sm font-bold">S</span>
              </div>
              <span className="font-semibold text-gray-900">Spring</span>
            </Link>
            {user ? (
              <span className="text-sm text-gray-500">{user.email}</span>
            ) : (
              <Link
                href={`/${locale}/login`}
                className="text-sm text-pink-600 hover:text-pink-700 font-medium"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Choose the plan that fits your needs. Upgrade or downgrade at any time.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center mb-12">
          <div className="bg-gray-100 p-1 rounded-lg inline-flex">
            <button
              onClick={() => setBilling("monthly")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                billing === "monthly"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("yearly")}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                billing === "yearly"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Yearly
              <span className="ml-1 text-green-600 text-xs">Save 17%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {(Object.entries(PLANS) as [Plan, PlanDetails][]).map(([key, plan]) => (
            <div
              key={key}
              className={`relative bg-white rounded-2xl border-2 p-6 flex flex-col ${
                plan.highlight
                  ? "border-pink-500 shadow-lg"
                  : "border-gray-200"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-pink-500 text-white text-xs font-medium px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline">
                  <span className="text-3xl font-bold text-gray-900">
                    ${billing === "yearly" ? Math.round(plan.yearlyPrice / 12) : plan.monthlyPrice}
                  </span>
                  <span className="text-gray-500 ml-1">/mo</span>
                </div>
                {billing === "yearly" && plan.yearlyPrice > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    ${plan.yearlyPrice} billed yearly
                  </p>
                )}
              </div>

              <ul className="space-y-3 mb-6 flex-1">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
                    <span className="text-gray-600">{feature}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleSubscribe(key)}
                disabled={isLoading === key}
                className={`w-full py-2.5 px-4 rounded-lg font-medium transition-colors ${
                  plan.highlight
                    ? "bg-pink-500 text-white hover:bg-pink-600"
                    : key === "free"
                    ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    : "bg-gray-900 text-white hover:bg-gray-800"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isLoading === key ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    Processing...
                  </span>
                ) : key === "free" ? (
                  "Current Plan"
                ) : key === "enterprise" ? (
                  "Contact Sales"
                ) : (
                  "Get Started"
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Feature Comparison Table */}
        <div className="mt-20">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Compare Plans
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 font-medium text-gray-500">Feature</th>
                  {(Object.entries(PLANS) as [Plan, PlanDetails][]).map(([key, plan]) => (
                    <th key={key} className="text-center py-4 px-4 font-medium text-gray-900">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-600">GPT-4o Mini</td>
                  {(Object.values(PLANS) as PlanDetails[]).map((plan, i) => (
                    <td key={i} className="text-center py-3 px-4 text-sm">{plan.limits.gpt4oMini}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-600">GPT-4o</td>
                  {(Object.values(PLANS) as PlanDetails[]).map((plan, i) => (
                    <td key={i} className="text-center py-3 px-4 text-sm">{plan.limits.gpt4o}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-600">Claude Sonnet</td>
                  {(Object.values(PLANS) as PlanDetails[]).map((plan, i) => (
                    <td key={i} className="text-center py-3 px-4 text-sm">{plan.limits.claude}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-600">SD Images</td>
                  {(Object.values(PLANS) as PlanDetails[]).map((plan, i) => (
                    <td key={i} className="text-center py-3 px-4 text-sm">{plan.limits.sdImages}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-600">DALL-E Images</td>
                  {(Object.values(PLANS) as PlanDetails[]).map((plan, i) => (
                    <td key={i} className="text-center py-3 px-4 text-sm">{plan.limits.dalleImages}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-3 px-4 text-sm text-gray-600">File Analysis</td>
                  {(Object.values(PLANS) as PlanDetails[]).map((plan, i) => (
                    <td key={i} className="text-center py-3 px-4 text-sm">{plan.limits.files}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-20 max-w-3xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            <FAQ
              question="Can I change plans at any time?"
              answer="Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately, and we'll prorate your billing."
            />
            <FAQ
              question="What happens if I exceed my limits?"
              answer="You'll receive a notification when approaching your limits. Once reached, you can wait for the daily reset or upgrade your plan for more capacity."
            />
            <FAQ
              question="Is there a free trial?"
              answer="The Free plan is always available with no time limit. You can try all features with limited usage before deciding to upgrade."
            />
            <FAQ
              question="How does billing work?"
              answer="We use LemonSqueezy for secure payment processing. You can pay with credit card or PayPal. Annual plans are billed upfront."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

// ===========================================
// Components
// ===========================================
function FAQ({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="border-b border-gray-200 pb-6">
      <h3 className="text-lg font-medium text-gray-900 mb-2">{question}</h3>
      <p className="text-gray-600">{answer}</p>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}
