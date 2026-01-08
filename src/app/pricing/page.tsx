"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CheckoutButton, PLAN_VARIANTS } from "@/components/checkout-button";

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
  }
}

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started and small projects",
    features: [
      "10,000 memories",
      "1,000 API calls/day",
      "2 API keys",
      "60 req/min rate limit",
      "Community support",
      "Basic analytics",
    ],
    cta: "Get Started",
    href: "/login",
    highlighted: false,
  },
  {
    name: "Plus",
    price: "$9",
    period: "per month",
    description: "For growing projects and indie developers",
    features: [
      "100,000 memories",
      "10,000 API calls/day",
      "5 API keys",
      "300 req/min rate limit",
      "Email support",
      "Advanced analytics",
      "Webhooks",
    ],
    cta: "Subscribe",
    variantId: PLAN_VARIANTS.plus,
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "per month",
    description: "For professional teams and production apps",
    features: [
      "1,000,000 memories",
      "100,000 API calls/day",
      "10 API keys",
      "600 req/min rate limit",
      "Priority support (24h)",
      "Advanced analytics",
      "Webhooks",
      "Team collaboration",
    ],
    cta: "Subscribe",
    variantId: PLAN_VARIANTS.pro,
    highlighted: true,
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "contact us",
    description: "For large organizations with custom needs",
    features: [
      "Unlimited memories",
      "Unlimited API calls",
      "100 API keys",
      "3000 req/min rate limit",
      "Dedicated account manager",
      "99.9% SLA guarantee",
      "SSO/SAML authentication",
      "Custom integrations",
      "Security audit reports",
      "Data retention policy",
      "On-premise option",
    ],
    cta: "Contact Sales",
    href: "/enterprise",
    highlighted: false,
  },
];

const faqs = [
  {
    q: "How does the free tier work?",
    a: "The free tier includes 10,000 memories and 1,000 API calls per day. It's perfect for prototyping, side projects, or testing the API. No credit card required.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes! You can upgrade or downgrade your plan at any time. When upgrading, you'll be charged the prorated amount. When downgrading, your new plan will start at the next billing cycle.",
  },
  {
    q: "What happens if I exceed my limits?",
    a: "You'll receive a 429 rate limit error. Your data is safe and you won't be charged extra. Consider upgrading if you consistently hit limits.",
  },
  {
    q: "Do you offer annual billing?",
    a: "Yes, annual billing is available with 2 months free. Contact us for enterprise annual contracts.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards (Visa, Mastercard, American Express) through our secure payment provider, Lemon Squeezy.",
  },
  {
    q: "Can I get a refund?",
    a: "Yes, we offer a 14-day money-back guarantee. If you're not satisfied, contact us within 14 days of your purchase for a full refund.",
  },
];

export default function PricingPage() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.createLemonSqueezy) {
      window.createLemonSqueezy();
    }
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight">Seizn</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link href="/#features" className="text-sm text-gray-600 hover:text-black transition-colors">
              Features
            </Link>
            <Link href="/pricing" className="text-sm text-black font-medium">
              Pricing
            </Link>
            <Link href="/docs" className="text-sm text-gray-600 hover:text-black transition-colors">
              Docs
            </Link>
            <Link href="/login" className="text-sm text-gray-600 hover:text-black transition-colors">
              Login
            </Link>
            <Link
              href="/login"
              className="text-sm bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-semibold text-gray-900 mb-4">
            Simple, transparent pricing
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto">
            Start free and scale as you grow. No hidden fees, no surprises.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-6 rounded-2xl ${
                  plan.highlighted
                    ? "bg-black text-white"
                    : "bg-white border border-gray-200"
                }`}
              >
                {plan.badge && (
                  <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">
                    {plan.badge}
                  </div>
                )}
                <div className={`text-sm font-medium mb-2 ${plan.highlighted ? "text-gray-400" : "text-gray-500"}`}>
                  {plan.name}
                </div>
                <div className={`text-3xl font-semibold mb-1 ${plan.highlighted ? "text-white" : "text-gray-900"}`}>
                  {plan.price}
                </div>
                <div className={`text-sm mb-4 ${plan.highlighted ? "text-gray-400" : "text-gray-500"}`}>
                  {plan.period}
                </div>
                <p className={`text-sm mb-6 ${plan.highlighted ? "text-gray-300" : "text-gray-600"}`}>
                  {plan.description}
                </p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-2 text-sm ${
                        plan.highlighted ? "text-gray-300" : "text-gray-600"
                      }`}
                    >
                      <svg
                        className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                          plan.highlighted ? "text-emerald-400" : "text-emerald-500"
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>
                {plan.variantId ? (
                  <CheckoutButton
                    variantId={plan.variantId}
                    className={`block w-full py-3 rounded-full font-medium transition-colors text-center ${
                      plan.highlighted
                        ? "bg-white text-black hover:bg-gray-100"
                        : "border border-gray-200 text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {plan.cta}
                  </CheckoutButton>
                ) : (
                  <Link
                    href={plan.href || "/login"}
                    className={`block w-full py-3 rounded-full font-medium transition-colors text-center ${
                      plan.highlighted
                        ? "bg-white text-black hover:bg-gray-100"
                        : "border border-gray-200 text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            Compare plans
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-4 px-4 font-medium text-gray-900">Feature</th>
                  <th className="text-center py-4 px-4 font-medium text-gray-900">Free</th>
                  <th className="text-center py-4 px-4 font-medium text-gray-900">Plus</th>
                  <th className="text-center py-4 px-4 font-medium text-gray-900 bg-black/5 rounded-t-lg">Pro</th>
                  <th className="text-center py-4 px-4 font-medium text-gray-900">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Memories", values: ["10K", "100K", "1M", "Unlimited"] },
                  { name: "API Calls/Day", values: ["1K", "10K", "100K", "Unlimited"] },
                  { name: "API Keys", values: ["2", "5", "10", "100"] },
                  { name: "Rate Limit (req/min)", values: ["60", "300", "600", "3,000"] },
                  { name: "Webhooks", values: [false, true, true, true] },
                  { name: "Team Members", values: [false, false, true, true] },
                  { name: "Advanced Analytics", values: [false, true, true, true] },
                  { name: "Priority Support", values: [false, false, true, true] },
                  { name: "SLA Guarantee", values: [false, false, false, true] },
                  { name: "SSO/SAML", values: [false, false, false, true] },
                  { name: "Custom Integrations", values: [false, false, false, true] },
                  { name: "On-Premise", values: [false, false, false, true] },
                ].map((row, i) => (
                  <tr key={row.name} className={i % 2 === 0 ? "bg-white" : ""}>
                    <td className="py-3 px-4 text-sm text-gray-600">{row.name}</td>
                    {row.values.map((value, j) => (
                      <td
                        key={j}
                        className={`py-3 px-4 text-center text-sm ${
                          j === 2 ? "bg-black/5" : ""
                        }`}
                      >
                        {typeof value === "boolean" ? (
                          value ? (
                            <svg className="w-5 h-5 text-emerald-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )
                        ) : (
                          <span className="text-gray-900">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-semibold text-gray-900 text-center mb-12">
            Frequently asked questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="border-b border-gray-100 pb-6">
                <h3 className="text-lg font-medium text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-gray-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-black">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-white mb-4">
            Ready to get started?
          </h2>
          <p className="text-xl text-gray-400 mb-8">
            Start with the free plan and upgrade when you need more.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-white text-black font-medium rounded-full hover:bg-gray-100 transition-colors"
            >
              Start for Free
            </Link>
            <Link
              href="/enterprise"
              className="px-8 py-3 border border-gray-600 text-white font-medium rounded-full hover:bg-gray-900 transition-colors"
            >
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} Seizn. All rights reserved.
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Terms
            </Link>
            <Link href="/enterprise" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Enterprise
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
