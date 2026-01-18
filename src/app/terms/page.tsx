import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service - Seizn",
  description:
    "Terms of Service for Seizn AI-powered search infrastructure API. Read our service agreement, API usage terms, and legal policies.",
  openGraph: {
    title: "Terms of Service - Seizn",
    description:
      "Terms of Service for Seizn AI-powered search infrastructure API.",
    type: "website",
  },
};

export default function TermsOfServicePage() {
  const currentYear = new Date().getFullYear();
  const lastUpdated = "January 14, 2026";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-900">
            Seizn<span className="text-emerald-600">.</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/docs"
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-medium rounded-lg transition-colors"
            >
              Get Started
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-12">
          <p className="text-gray-400 text-sm mb-2">
            Last updated: {lastUpdated}
          </p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Terms of Service
          </h1>
          <p className="text-xl text-gray-500">
            Please read these terms carefully before using our services.
          </p>
        </div>

        <div className="prose prose prose-gray max-w-none">
          {/* 1. Introduction */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              1. Introduction
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <p>
                Welcome to Seizn. These Terms of Service (&quot;Terms&quot;)
                govern your access to and use of the Seizn platform, including
                our AI-powered search infrastructure API, website, and related
                services (collectively, the &quot;Service&quot;).
              </p>
              <p>
                By accessing or using our Service, you agree to be bound by
                these Terms. If you do not agree to these Terms, you may not
                access or use the Service.
              </p>
              <p>
                Seizn provides an AI-powered memory and search infrastructure
                API that enables developers to build applications with
                persistent memory capabilities, semantic search, and intelligent
                data extraction.
              </p>
            </div>
          </section>

          {/* 2. Definitions */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              2. Definitions
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700">
              <ul className="space-y-3 list-none pl-0">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-semibold min-w-fit">
                    &quot;Service&quot;
                  </span>
                  <span>
                    refers to the Seizn platform, API, website, and all related
                    services.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-semibold min-w-fit">
                    &quot;User&quot;
                  </span>
                  <span>
                    refers to any individual or entity that accesses or uses the
                    Service.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-semibold min-w-fit">
                    &quot;API&quot;
                  </span>
                  <span>
                    refers to the Application Programming Interface provided by
                    Seizn.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-semibold min-w-fit">
                    &quot;Content&quot;
                  </span>
                  <span>
                    refers to any data, text, or information submitted to or
                    processed by the Service.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-600 font-semibold min-w-fit">
                    &quot;API Key&quot;
                  </span>
                  <span>
                    refers to the unique authentication credential issued to
                    Users for API access.
                  </span>
                </li>
              </ul>
            </div>
          </section>

          {/* 3. Account Terms */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              3. Account Terms
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                3.1 Account Registration
              </h3>
              <p>
                To use certain features of the Service, you must register for an
                account. When you register, you agree to provide accurate,
                current, and complete information about yourself.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                3.2 Account Security
              </h3>
              <p>
                You are responsible for maintaining the confidentiality of your
                account credentials, including your API keys. You agree to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Keep your API keys secure and confidential</li>
                <li>
                  Not share your account credentials with unauthorized parties
                </li>
                <li>
                  Notify us immediately of any unauthorized access to your
                  account
                </li>
                <li>
                  Accept responsibility for all activities that occur under your
                  account
                </li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                3.3 Age Requirements
              </h3>
              <p>
                You must be at least 18 years old to use the Service. By using
                the Service, you represent and warrant that you meet this age
                requirement.
              </p>
            </div>
          </section>

          {/* 4. User Obligations and Acceptable Use */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              4. User Obligations and Acceptable Use
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                4.1 Acceptable Use
              </h3>
              <p>You agree to use the Service only for lawful purposes. You will not:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  Violate any applicable laws, regulations, or third-party
                  rights
                </li>
                <li>
                  Store or transmit malicious code, viruses, or harmful content
                </li>
                <li>
                  Attempt to gain unauthorized access to the Service or its
                  related systems
                </li>
                <li>
                  Interfere with or disrupt the integrity or performance of the
                  Service
                </li>
                <li>
                  Use the Service to send unsolicited communications or spam
                </li>
                <li>
                  Reverse engineer, decompile, or disassemble any portion of the
                  Service
                </li>
                <li>
                  Use the Service to process or store sensitive personal data
                  without appropriate safeguards
                </li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                4.2 Prohibited Content
              </h3>
              <p>
                You will not use the Service to store, process, or transmit
                content that:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Is illegal, harmful, or promotes illegal activities</li>
                <li>Infringes on intellectual property rights</li>
                <li>Contains hate speech, harassment, or threats</li>
                <li>Violates the privacy of others</li>
                <li>
                  Contains unencrypted sensitive personal information such as
                  social security numbers, financial account numbers, or health
                  records
                </li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                4.3 Compliance
              </h3>
              <p>
                You are solely responsible for ensuring that your use of the
                Service complies with all applicable laws and regulations,
                including data protection and privacy laws.
              </p>
            </div>
          </section>

          {/* 5. API Usage Terms and Rate Limits */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              5. API Usage Terms and Rate Limits
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                5.1 API Access
              </h3>
              <p>
                Access to the Seizn API is provided through API keys. Each API
                key is subject to usage limits based on your subscription plan.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                5.2 Rate Limits
              </h3>
              <p>
                The Service enforces rate limits to ensure fair usage and system
                stability:
              </p>
              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">
                        Plan
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">
                        Daily API Calls
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">
                        Max Memories
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700">
                        API Keys
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    <tr>
                      <td className="px-4 py-2">Free</td>
                      <td className="px-4 py-2 text-gray-500">1,000</td>
                      <td className="px-4 py-2 text-gray-500">10,000</td>
                      <td className="px-4 py-2 text-gray-500">2</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Plus</td>
                      <td className="px-4 py-2 text-gray-500">10,000</td>
                      <td className="px-4 py-2 text-gray-500">100,000</td>
                      <td className="px-4 py-2 text-gray-500">5</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Pro</td>
                      <td className="px-4 py-2 text-gray-500">100,000</td>
                      <td className="px-4 py-2 text-gray-500">1,000,000</td>
                      <td className="px-4 py-2 text-gray-500">10</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-2">Enterprise</td>
                      <td className="px-4 py-2 text-gray-500">Unlimited</td>
                      <td className="px-4 py-2 text-gray-500">Unlimited</td>
                      <td className="px-4 py-2 text-gray-500">100</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                5.3 Exceeding Limits
              </h3>
              <p>
                If you exceed your rate limits, you will receive a{" "}
                <code className="px-2 py-1 bg-gray-100 rounded text-red-400">
                  429 Too Many Requests
                </code>{" "}
                response. Repeated violations may result in temporary or
                permanent suspension of API access.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                5.4 API Key Management
              </h3>
              <p>
                You are responsible for securely storing and managing your API
                keys. Do not embed API keys in client-side code, version control
                systems, or publicly accessible locations.
              </p>
            </div>
          </section>

          {/* 6. Intellectual Property Rights */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              6. Intellectual Property Rights
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                6.1 Seizn Intellectual Property
              </h3>
              <p>
                The Service, including its original content, features, and
                functionality, is owned by Seizn and protected by international
                copyright, trademark, patent, trade secret, and other
                intellectual property laws.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                6.2 Your Content
              </h3>
              <p>
                You retain all rights to any content you submit to the Service.
                By submitting content, you grant Seizn a worldwide,
                non-exclusive, royalty-free license to use, process, and store
                your content solely for the purpose of providing and improving
                the Service.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                6.3 Feedback
              </h3>
              <p>
                If you provide feedback, suggestions, or ideas about the
                Service, you grant Seizn the right to use such feedback without
                restriction or compensation to you.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                6.4 Trademarks
              </h3>
              <p>
                The Seizn name, logo, and all related names, logos, product and
                service names, designs, and slogans are trademarks of Seizn. You
                may not use such marks without our prior written permission.
              </p>
            </div>
          </section>

          {/* 7. Payment Terms */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              7. Payment Terms
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                7.1 Subscription Plans
              </h3>
              <p>
                Seizn offers various subscription plans with different features
                and pricing. Details of available plans are provided on our
                pricing page.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                7.2 Payment Processing
              </h3>
              <p>
                All payments are processed through Paddle, our authorized
                payment processor. By making a payment, you also agree to
                Paddle&apos;s terms of service and privacy policy.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                7.3 Billing Cycle
              </h3>
              <p>
                Subscriptions are billed on a recurring basis (monthly or
                annually, depending on your selected plan). Your subscription
                will automatically renew unless cancelled before the end of the
                current billing period.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                7.4 Refunds
              </h3>
              <p>
                Refunds may be provided at our discretion. If you are not
                satisfied with the Service, please contact us within 14 days of
                your initial purchase to request a refund.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                7.5 Price Changes
              </h3>
              <p>
                We reserve the right to modify our pricing at any time. Price
                changes will be communicated to existing subscribers at least 30
                days before taking effect.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                7.6 Taxes
              </h3>
              <p>
                All fees are exclusive of taxes. You are responsible for paying
                all applicable taxes related to your use of the Service.
              </p>
            </div>
          </section>

          {/* 8. Data and Privacy */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              8. Data and Privacy
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                8.1 Data Processing
              </h3>
              <p>
                By using the Service, you acknowledge that your content will be
                processed by our AI systems for the purpose of providing memory
                storage, semantic search, and data extraction features.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                8.2 Data Security
              </h3>
              <p>
                We implement industry-standard security measures to protect your
                data, including:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Encryption at rest (AES-256)</li>
                <li>Encryption in transit (TLS 1.3)</li>
                <li>Multi-tenant data isolation</li>
                <li>Regular security audits</li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                8.3 Data Retention
              </h3>
              <p>
                Your data is retained as long as your account is active. Upon
                account termination, your data will be deleted within 30 days,
                unless retention is required by law.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                8.4 Privacy Policy
              </h3>
              <p>
                Your use of the Service is also governed by our Privacy Policy,
                which describes how we collect, use, and protect your personal
                information.
              </p>
            </div>
          </section>

          {/* 9. Limitation of Liability */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              9. Limitation of Liability
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                9.1 Disclaimer of Warranties
              </h3>
              <p>
                THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS
                AVAILABLE&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS
                OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
                MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
                NON-INFRINGEMENT.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                9.2 Limitation of Liability
              </h3>
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, SEIZN SHALL NOT BE
                LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
                PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS,
                DATA, USE, OR GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF
                THE SERVICE.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                9.3 Maximum Liability
              </h3>
              <p>
                IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT PAID BY
                YOU TO SEIZN IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR
                ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                9.4 Service Availability
              </h3>
              <p>
                We do not guarantee that the Service will be available at all
                times. We may experience hardware, software, or other problems,
                or need to perform maintenance, resulting in interruptions,
                delays, or errors.
              </p>
            </div>
          </section>

          {/* 10. Indemnification */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              10. Indemnification
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700">
              <p>
                You agree to defend, indemnify, and hold harmless Seizn and its
                officers, directors, employees, and agents from and against any
                claims, liabilities, damages, losses, and expenses, including
                reasonable attorney&apos;s fees, arising out of or in any way
                connected with:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-4">
                <li>Your access to or use of the Service</li>
                <li>Your violation of these Terms</li>
                <li>
                  Your violation of any third-party rights, including
                  intellectual property rights
                </li>
                <li>
                  Any content you submit to the Service that causes damage to a
                  third party
                </li>
              </ul>
            </div>
          </section>

          {/* 11. Termination */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              11. Termination
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                11.1 Termination by You
              </h3>
              <p>
                You may terminate your account at any time by contacting us or
                using the account settings in your dashboard. Upon termination,
                your right to use the Service will immediately cease.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                11.2 Termination by Seizn
              </h3>
              <p>
                We may terminate or suspend your account and access to the
                Service immediately, without prior notice or liability, for any
                reason, including if you breach these Terms.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                11.3 Effect of Termination
              </h3>
              <p>Upon termination:</p>
              <ul className="list-disc pl-6 space-y-2 mt-2">
                <li>Your license to use the Service will terminate</li>
                <li>
                  You will no longer have access to your account or data stored
                  in the Service
                </li>
                <li>
                  Any outstanding payment obligations will remain due and
                  payable
                </li>
                <li>
                  Provisions that by their nature should survive termination
                  will survive
                </li>
              </ul>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                11.4 Data Export
              </h3>
              <p>
                Before terminating your account, you may export your data using
                the API or by contacting support. After termination, your data
                will be deleted in accordance with our data retention policy.
              </p>
            </div>
          </section>

          {/* 12. Modifications to Terms */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              12. Modifications to Terms
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <p>
                We reserve the right to modify these Terms at any time. If we
                make material changes, we will provide notice through the
                Service or by email at least 30 days before the changes take
                effect.
              </p>
              <p>
                Your continued use of the Service after the effective date of
                any modifications constitutes your acceptance of the modified
                Terms. If you do not agree to the modified Terms, you must stop
                using the Service.
              </p>
            </div>
          </section>

          {/* 13. Governing Law */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              13. Governing Law
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <p>
                These Terms shall be governed by and construed in accordance
                with the laws of the Republic of Korea, without regard to its
                conflict of law principles.
              </p>
              <p>
                Any disputes arising from or relating to these Terms or the
                Service shall be resolved in the courts located in Seoul,
                Republic of Korea, and you consent to the personal jurisdiction
                of such courts.
              </p>
            </div>
          </section>

          {/* 14. General Provisions */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              14. General Provisions
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700 space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">
                14.1 Entire Agreement
              </h3>
              <p>
                These Terms constitute the entire agreement between you and
                Seizn regarding the Service and supersede all prior agreements
                and understandings.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                14.2 Severability
              </h3>
              <p>
                If any provision of these Terms is found to be unenforceable,
                the remaining provisions will continue in full force and effect.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                14.3 Waiver
              </h3>
              <p>
                The failure of Seizn to enforce any right or provision of these
                Terms will not be deemed a waiver of such right or provision.
              </p>

              <h3 className="text-lg font-semibold text-gray-900 mt-6">
                14.4 Assignment
              </h3>
              <p>
                You may not assign or transfer these Terms without our prior
                written consent. We may assign or transfer these Terms without
                restriction.
              </p>
            </div>
          </section>

          {/* 15. Contact Information */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              15. Contact Information
            </h2>
            <div className="bg-white border border-gray-200 rounded-xl p-6 text-gray-700">
              <p className="mb-4">
                If you have any questions about these Terms of Service, please
                contact us:
              </p>
              <div className="space-y-2">
                <p>
                  <span className="text-gray-400">Email:</span>{" "}
                  <a
                    href="mailto:support@seizn.com"
                    className="text-emerald-600 hover:underline"
                  >
                    support@seizn.com
                  </a>
                </p>
                <p>
                  <span className="text-gray-400">Website:</span>{" "}
                  <a
                    href="https://seizn.com"
                    className="text-emerald-600 hover:underline"
                  >
                    https://seizn.com
                  </a>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-gray-400 text-sm">
            &copy; {currentYear} Seizn. All rights reserved.
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link
              href="/privacy"
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-emerald-600 hover:text-emerald-500 transition-colors"
            >
              Terms of Service
            </Link>
            <Link
              href="/docs"
              className="text-gray-500 hover:text-gray-900 transition-colors"
            >
              Documentation
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
