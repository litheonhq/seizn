import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund Policy · Seizn",
  description:
    "Seizn refund policy. Learn about our 14-day money-back guarantee, eligibility conditions, and how to request a refund.",
  openGraph: {
    title: "Refund Policy · Seizn",
    description:
      "Seizn refund policy. Learn about our 14-day money-back guarantee, eligibility conditions, and how to request a refund.",
    type: "website",
    url: "https://www.seizn.com/refund",
  },
  alternates: {
    canonical: "/refund",
  },
};

export default function RefundPolicyPage() {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
          {/* Header */}
          <header className="border-b border-gray-100 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
            <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
              <Link
                href="/"
                className="text-xl font-semibold text-gray-900 hover:text-[var(--ink-900)] transition-colors"
              >
                Seizn
              </Link>
              <nav className="flex items-center gap-6 text-sm text-gray-600">
                <Link href="/en" className="hover:text-gray-900 transition-colors">
                  Home
                </Link>
                <Link href="/en/pricing" className="hover:text-gray-900 transition-colors">
                  Pricing
                </Link>
                <Link href="/docs" className="hover:text-gray-900 transition-colors">
                  Docs
                </Link>
              </nav>
            </div>
          </header>

          {/* Main Content */}
          <main className="max-w-4xl mx-auto px-6 py-16">
            {/* Title Section */}
            <div className="mb-12">
              <p className="text-sm text-gray-500 mb-2">Last updated: January 14, 2026</p>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Refund Policy</h1>
              <p className="text-lg text-gray-600">
                At Seizn, we want you to be completely satisfied with your purchase. This policy
                outlines our refund terms and how to request a refund if needed.
              </p>
            </div>

            {/* Policy Content */}
            <div className="prose prose-gray max-w-none">
              {/* 14-Day Money-Back Guarantee */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    1
                  </span>
                  14-Day Money-Back Guarantee
                </h2>
                <div className="bg-gradient-to-r from-[var(--ink-50)] to-[var(--ink-100)] border border-[var(--ink-900)] rounded-xl p-6 mb-4">
                  <p className="text-gray-700 leading-relaxed">
                    We offer a <strong>full refund within 14 days</strong> of your initial purchase
                    date. If you&apos;re not satisfied with Seizn for any reason during this period, you
                    can request a complete refund with no questions asked.
                  </p>
                </div>
                <p className="text-gray-600 leading-relaxed">
                  This guarantee applies to all new subscription purchases, including monthly and
                  annual plans. We believe in our product and want you to have ample time to
                  evaluate whether Seizn meets your needs.
                </p>
              </section>

              {/* Eligibility Conditions */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    2
                  </span>
                  Eligibility Conditions
                </h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  To be eligible for a refund, the following conditions must be met:
                </p>
                <ul className="space-y-3 mb-4">
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-[var(--signal-canon-ink)] mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-600">
                      The refund request must be made within 14 days of the original purchase date
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-[var(--signal-canon-ink)] mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-600">
                      This must be your first purchase of a Seizn subscription (not applicable to
                      renewals)
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-[var(--signal-canon-ink)] mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-600">
                      You have not previously received a refund for a Seizn subscription
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-[var(--signal-canon-ink)] mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-gray-600">
                      Your account has not been terminated for violation of our Terms of Service
                    </span>
                  </li>
                </ul>
              </section>

              {/* Non-Refundable Items */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    3
                  </span>
                  Non-Refundable Items
                </h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  The following items and circumstances are not eligible for refunds:
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
                  <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-[var(--signal-conflict-soft)] mt-0.5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      <span className="text-gray-600">
                        <strong>API usage credits already consumed:</strong> If you have used a
                        significant portion of your API credits (more than 20% of your plan&apos;s
                        allocation), a partial refund may be issued instead
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-[var(--signal-conflict-soft)] mt-0.5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      <span className="text-gray-600">
                        <strong>Subscription renewals:</strong> Automatic renewals after the initial
                        subscription period are not eligible for the 14-day refund guarantee
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-[var(--signal-conflict-soft)] mt-0.5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      <span className="text-gray-600">
                        <strong>Enterprise custom agreements:</strong> Enterprise plans with custom
                        terms are governed by their individual agreements
                      </span>
                    </li>
                    <li className="flex items-start gap-3">
                      <svg
                        className="w-5 h-5 text-[var(--signal-conflict-soft)] mt-0.5 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                      <span className="text-gray-600">
                        <strong>Add-on purchases:</strong> One-time add-on purchases such as extra
                        storage or additional API credits
                      </span>
                    </li>
                  </ul>
                </div>
              </section>

              {/* Subscription Cancellation vs. Refund */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    4
                  </span>
                  Subscription Cancellation vs. Refund
                </h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  It&apos;s important to understand the difference between canceling your subscription
                  and requesting a refund:
                </p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-blue-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Subscription Cancellation
                    </h3>
                    <ul className="text-gray-600 text-sm space-y-2">
                      <li>Stops future billing</li>
                      <li>You retain access until the current billing period ends</li>
                      <li>No refund is issued for the remaining period</li>
                      <li>Can be done anytime from your account settings</li>
                    </ul>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <svg
                        className="w-5 h-5 text-[var(--ink-900)]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                        />
                      </svg>
                      Refund Request
                    </h3>
                    <ul className="text-gray-600 text-sm space-y-2">
                      <li>Returns your payment (full or partial)</li>
                      <li>Access is terminated immediately upon refund</li>
                      <li>Only available within the 14-day window</li>
                      <li>Must be requested via email to support</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* How to Request a Refund */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    5
                  </span>
                  How to Request a Refund
                </h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  To request a refund, please follow these steps:
                </p>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="border-b border-gray-100 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center font-bold flex-shrink-0">
                        1
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Send an email to our support team</h4>
                        <p className="text-gray-600 text-sm">
                          Contact us at{" "}
                          <a
                            href="mailto:support@seizn.com"
                            className="text-[var(--ink-900)] hover:text-[var(--ink-900)] font-medium"
                          >
                            support@seizn.com
                          </a>{" "}
                          with the subject line &quot;Refund Request&quot;.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="border-b border-gray-100 p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center font-bold flex-shrink-0">
                        2
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Include required information</h4>
                        <p className="text-gray-600 text-sm">
                          Please include your registered email address, order/transaction ID, and
                          the reason for your refund request.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center font-bold flex-shrink-0">
                        3
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 mb-1">Wait for confirmation</h4>
                        <p className="text-gray-600 text-sm">
                          Our team will review your request and respond within 1-2 business days
                          with confirmation or any additional questions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Processing Time */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    6
                  </span>
                  Processing Time
                </h2>
                <div className="bg-gradient-to-r from-[var(--ink-50)] to-[var(--ink-100)] border border-blue-100 rounded-xl p-6">
                  <div className="flex items-start gap-4">
                    <svg
                      className="w-8 h-8 text-blue-500 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="text-gray-700 leading-relaxed">
                        Once your refund is approved, please allow{" "}
                        <strong>5-10 business days</strong> for the refund to appear in your
                        account. The exact timing depends on your payment provider and financial
                        institution.
                      </p>
                      <p className="text-gray-600 text-sm mt-2">
                        You will receive an email confirmation once the refund has been processed
                        on our end.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Refund Method */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    7
                  </span>
                  Refund Method
                </h2>
                <p className="text-gray-600 mb-4 leading-relaxed">
                  All refunds are processed through our payment processor,{" "}
                  <strong>Paddle</strong>, and will be returned to your{" "}
                  <strong>original payment method</strong>:
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                    <span className="text-gray-600">
                      <strong>Credit/Debit Card:</strong> Refund will be credited back to the same
                      card used for purchase
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <span className="text-gray-600">
                      <strong>PayPal:</strong> Refund will be credited to your PayPal account
                    </span>
                  </li>
                  <li className="flex items-start gap-3">
                    <svg
                      className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-gray-600">
                      <strong>Other methods:</strong> Refund will be processed according to
                      Paddle&apos;s standard refund procedures for your payment type
                    </span>
                  </li>
                </ul>
              </section>

              {/* Contact Information */}
              <section className="mb-12">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    8
                  </span>
                  Contact Information
                </h2>
                <div className="bg-[var(--ink-900)] text-white rounded-xl p-8">
                  <p className="text-gray-300 mb-6 leading-relaxed">
                    If you have any questions about this refund policy or need assistance with a
                    refund request, please don&apos;t hesitate to contact us:
                  </p>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-[var(--ink-900)]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Email</p>
                        <a
                          href="mailto:support@seizn.com"
                          className="text-white hover:text-[var(--ink-900)] transition-colors font-medium"
                        >
                          support@seizn.com
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-[var(--ink-900)]"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm text-gray-400">Response Time</p>
                        <p className="text-white font-medium">Within 1-2 business days</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Policy Updates */}
              <section className="mb-8">
                <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] flex items-center justify-center text-sm font-bold">
                    9
                  </span>
                  Policy Updates
                </h2>
                <p className="text-gray-600 leading-relaxed">
                  We reserve the right to modify this refund policy at any time. Changes will be
                  effective immediately upon posting to this page. We encourage you to review this
                  policy periodically. Your continued use of Seizn after any changes constitutes
                  your acceptance of the updated policy.
                </p>
              </section>
            </div>
          </main>

          {/* Footer */}
          <footer className="border-t border-gray-200 bg-white">
            <div className="max-w-4xl mx-auto px-6 py-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <p className="text-sm text-gray-500">
                  &copy; {new Date().getFullYear()} Seizn. All rights reserved.
                </p>
                <nav className="flex items-center gap-6 text-sm text-gray-500">
                  <Link href="/terms" className="hover:text-gray-900 transition-colors">
                    Terms of Service
                  </Link>
                  <Link href="/privacy" className="hover:text-gray-900 transition-colors">
                    Privacy Policy
                  </Link>
                  <Link href="/refund" className="text-[var(--ink-900)] font-medium">
                    Refund Policy
                  </Link>
                </nav>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
