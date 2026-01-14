import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Seizn",
  description:
    "Learn how Seizn collects, uses, and protects your personal information. Our commitment to your privacy and data security.",
  openGraph: {
    title: "Privacy Policy | Seizn",
    description:
      "Learn how Seizn collects, uses, and protects your personal information.",
    url: "https://www.seizn.com/privacy",
    siteName: "Seizn",
    type: "website",
  },
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            <span className="font-medium">Back to Seizn</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title Section */}
        <div className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
            Privacy Policy
          </h1>
          <p className="text-gray-500 text-lg">
            Last updated: January 14, 2026
          </p>
        </div>

        {/* Content */}
        <div className="prose prose-gray prose-lg max-w-none">
          {/* Introduction */}
          <section className="mb-12">
            <p className="text-gray-600 leading-relaxed">
              At Seizn (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), we
              are committed to protecting your privacy and ensuring the security
              of your personal information. This Privacy Policy explains how we
              collect, use, disclose, and safeguard your information when you
              use our AI memory infrastructure platform and related services
              (collectively, the &quot;Service&quot;).
            </p>
            <p className="text-gray-600 leading-relaxed mt-4">
              By accessing or using our Service, you agree to this Privacy
              Policy. If you do not agree with the terms of this Privacy Policy,
              please do not access or use the Service.
            </p>
          </section>

          {/* Section 1: Information We Collect */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              1. Information We Collect
            </h2>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              1.1 Account Information
            </h3>
            <p className="text-gray-600 leading-relaxed">
              When you create an account, we collect:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>Email address</li>
              <li>Name (if provided)</li>
              <li>Profile picture (if provided via OAuth)</li>
              <li>
                Authentication credentials (securely hashed passwords or OAuth
                tokens)
              </li>
              <li>Account preferences and settings</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              1.2 Usage Data
            </h3>
            <p className="text-gray-600 leading-relaxed">
              We automatically collect information about how you interact with
              our Service:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>API request logs (timestamps, endpoints called, response times)</li>
              <li>Feature usage patterns and frequency</li>
              <li>Device information (browser type, operating system, device type)</li>
              <li>IP address and approximate location (country/region level)</li>
              <li>Referring URLs and pages visited within our Service</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              1.3 Memory and Content Data
            </h3>
            <p className="text-gray-600 leading-relaxed">
              When you use our AI memory infrastructure, we store:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>Memory entries you create through our API</li>
              <li>Metadata associated with memories (timestamps, tags, categories)</li>
              <li>Vector embeddings generated from your content</li>
              <li>Search queries and retrieval patterns</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              1.4 Payment Information
            </h3>
            <p className="text-gray-600 leading-relaxed">
              When you subscribe to a paid plan, payment processing is handled
              by our third-party payment processor (Paddle). We do not directly
              store your credit card numbers or banking details. We receive:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>Transaction IDs and payment status</li>
              <li>Billing address (country and postal code)</li>
              <li>Subscription plan and billing cycle information</li>
              <li>Payment method type (e.g., credit card, PayPal)</li>
            </ul>
          </section>

          {/* Section 2: How We Use Your Information */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              2. How We Use Your Information
            </h2>
            <p className="text-gray-600 leading-relaxed">
              We use the information we collect to:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>Provide, maintain, and improve our Service</li>
              <li>Process transactions and send related notifications</li>
              <li>Authenticate users and secure accounts</li>
              <li>Respond to customer support requests and inquiries</li>
              <li>Send administrative communications (service updates, security alerts)</li>
              <li>Analyze usage patterns to enhance user experience</li>
              <li>Detect and prevent fraud, abuse, and security incidents</li>
              <li>Comply with legal obligations and enforce our Terms of Service</li>
              <li>
                Develop new features and services based on aggregated,
                anonymized insights
              </li>
            </ul>
          </section>

          {/* Section 3: Data Storage and Security */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              3. Data Storage and Security
            </h2>
            <p className="text-gray-600 leading-relaxed">
              We implement industry-standard security measures to protect your
              data:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>All data is encrypted in transit using TLS 1.3</li>
              <li>Data at rest is encrypted using AES-256 encryption</li>
              <li>API keys are securely hashed and never stored in plain text</li>
              <li>Regular security audits and penetration testing</li>
              <li>Access controls and authentication for all internal systems</li>
              <li>Automated monitoring for suspicious activity</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              Your data is primarily stored on servers located in the United
              States, with backup and redundancy systems to ensure availability.
              We use Supabase as our primary database provider, which maintains
              SOC 2 Type II compliance.
            </p>
          </section>

          {/* Section 4: Third-Party Services */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              4. Third-Party Services
            </h2>
            <p className="text-gray-600 leading-relaxed">
              We work with trusted third-party service providers to operate our
              Service:
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              4.1 Paddle (Payment Processing)
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Paddle acts as our Merchant of Record, handling all payment
              processing, tax compliance, and billing. Paddle&apos;s privacy
              policy governs their use of your payment information. Visit{" "}
              <a
                href="https://www.paddle.com/legal/privacy"
                className="text-pink-600 hover:text-pink-700 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                paddle.com/legal/privacy
              </a>{" "}
              for details.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              4.2 Supabase (Database Infrastructure)
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Supabase provides our database and authentication infrastructure.
              They maintain strict data protection standards and comply with
              GDPR and other privacy regulations. Visit{" "}
              <a
                href="https://supabase.com/privacy"
                className="text-pink-600 hover:text-pink-700 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                supabase.com/privacy
              </a>{" "}
              for their privacy policy.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              4.3 Vercel (Hosting)
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Our application is hosted on Vercel&apos;s platform. Vercel may
              collect server logs and performance data. Visit{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                className="text-pink-600 hover:text-pink-700 underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                vercel.com/legal/privacy-policy
              </a>{" "}
              for details.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              4.4 Analytics
            </h3>
            <p className="text-gray-600 leading-relaxed">
              We use privacy-focused analytics to understand how users interact
              with our Service. Analytics data is aggregated and does not
              include personally identifiable information. We do not sell
              analytics data to third parties.
            </p>
          </section>

          {/* Section 5: Cookies and Tracking */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              5. Cookies and Tracking Technologies
            </h2>
            <p className="text-gray-600 leading-relaxed">
              We use cookies and similar technologies for the following
              purposes:
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              5.1 Essential Cookies
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Required for the Service to function properly. These include:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>Session cookies to maintain your login state</li>
              <li>Security cookies to prevent CSRF attacks</li>
              <li>Language and locale preference cookies</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              5.2 Analytics Cookies
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Help us understand how visitors use our Service. These cookies
              collect aggregated, anonymous information.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              5.3 Managing Cookies
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can control cookies through your browser settings. Note that
              disabling essential cookies may prevent you from using certain
              features of our Service.
            </p>
          </section>

          {/* Section 6: Data Retention */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              6. Data Retention
            </h2>
            <p className="text-gray-600 leading-relaxed">
              We retain your data according to the following guidelines:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>
                <strong>Account data:</strong> Retained while your account is
                active and for 30 days after deletion request
              </li>
              <li>
                <strong>Memory data:</strong> Retained until you delete it or
                close your account
              </li>
              <li>
                <strong>API logs:</strong> Retained for 90 days for debugging
                and security purposes
              </li>
              <li>
                <strong>Payment records:</strong> Retained for 7 years as
                required for tax and legal compliance
              </li>
              <li>
                <strong>Analytics data:</strong> Aggregated data may be retained
                indefinitely; raw logs are deleted after 30 days
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              Upon account deletion, we will remove or anonymize your personal
              data within 30 days, except where retention is required by law or
              for legitimate business purposes.
            </p>
          </section>

          {/* Section 7: Your Rights */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              7. Your Rights
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Depending on your location, you may have the following rights
              regarding your personal data:
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              7.1 Right to Access
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can request a copy of the personal data we hold about you. We
              will provide this information within 30 days of your request.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              7.2 Right to Rectification
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can update or correct your personal data at any time through
              your account settings, or by contacting us.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              7.3 Right to Deletion
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can request deletion of your personal data. You can delete
              your account directly from your account settings, or contact us to
              request deletion.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              7.4 Right to Data Portability
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can request an export of your data in a machine-readable
              format (JSON). This includes your memories, account settings, and
              usage history.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              7.5 Right to Object
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can object to certain processing of your personal data, such
              as processing for direct marketing purposes.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              7.6 Right to Restrict Processing
            </h3>
            <p className="text-gray-600 leading-relaxed">
              You can request that we limit how we use your personal data while
              a complaint or issue is being resolved.
            </p>

            <p className="text-gray-600 leading-relaxed mt-4">
              To exercise any of these rights, please contact us at{" "}
              <a
                href="mailto:privacy@seizn.com"
                className="text-pink-600 hover:text-pink-700 underline"
              >
                privacy@seizn.com
              </a>
              .
            </p>
          </section>

          {/* Section 8: GDPR Compliance */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              8. GDPR Compliance
            </h2>
            <p className="text-gray-600 leading-relaxed">
              For users in the European Economic Area (EEA), United Kingdom, and
              Switzerland, we process personal data in accordance with the
              General Data Protection Regulation (GDPR) and equivalent local
              laws.
            </p>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              Legal Basis for Processing
            </h3>
            <p className="text-gray-600 leading-relaxed">
              We process your personal data on the following legal bases:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>
                <strong>Contract:</strong> Processing necessary to provide the
                Service you requested
              </li>
              <li>
                <strong>Legitimate Interests:</strong> Processing for fraud
                prevention, security, and service improvement
              </li>
              <li>
                <strong>Consent:</strong> Where you have explicitly consented to
                specific processing
              </li>
              <li>
                <strong>Legal Obligation:</strong> Processing required to comply
                with applicable laws
              </li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">
              International Data Transfers
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Your data may be transferred to and processed in countries outside
              your jurisdiction, including the United States. We use Standard
              Contractual Clauses (SCCs) approved by the European Commission to
              ensure adequate protection for such transfers.
            </p>
          </section>

          {/* Section 9: CCPA Compliance */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              9. California Privacy Rights (CCPA)
            </h2>
            <p className="text-gray-600 leading-relaxed">
              California residents have additional rights under the California
              Consumer Privacy Act (CCPA):
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>
                <strong>Right to Know:</strong> You can request information
                about the categories and specific pieces of personal data we
                have collected
              </li>
              <li>
                <strong>Right to Delete:</strong> You can request deletion of
                your personal data
              </li>
              <li>
                <strong>Right to Opt-Out:</strong> We do not sell personal
                information, so this right does not apply
              </li>
              <li>
                <strong>Right to Non-Discrimination:</strong> We will not
                discriminate against you for exercising your privacy rights
              </li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              <strong>We do not sell your personal information.</strong> We do
              not share your personal information for cross-context behavioral
              advertising.
            </p>
          </section>

          {/* Section 10: Children's Privacy */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              10. Children&apos;s Privacy
            </h2>
            <p className="text-gray-600 leading-relaxed">
              Our Service is not directed to individuals under the age of 16. We
              do not knowingly collect personal information from children under
              16. If you are a parent or guardian and believe your child has
              provided us with personal information, please contact us at{" "}
              <a
                href="mailto:privacy@seizn.com"
                className="text-pink-600 hover:text-pink-700 underline"
              >
                privacy@seizn.com
              </a>
              . We will take steps to delete such information from our systems.
            </p>
          </section>

          {/* Section 11: Changes to This Policy */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              11. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-600 leading-relaxed">
              We may update this Privacy Policy from time to time to reflect
              changes in our practices, technologies, legal requirements, or
              other factors. When we make material changes:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2 text-gray-600">
              <li>We will update the &quot;Last updated&quot; date at the top of this page</li>
              <li>We will notify you via email (if you have an account) at least 7 days before the changes take effect</li>
              <li>We may display a prominent notice on our website</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              Your continued use of the Service after the effective date of the
              revised Privacy Policy constitutes your acceptance of the changes.
            </p>
          </section>

          {/* Section 12: Contact Us */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 pb-2 border-b border-gray-200">
              12. Contact Us
            </h2>
            <p className="text-gray-600 leading-relaxed">
              If you have any questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact us:
            </p>
            <div className="mt-6 p-6 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-gray-800 font-semibold mb-2">Seizn Privacy Team</p>
              <p className="text-gray-600">
                Email:{" "}
                <a
                  href="mailto:privacy@seizn.com"
                  className="text-pink-600 hover:text-pink-700 underline"
                >
                  privacy@seizn.com
                </a>
              </p>
              <p className="text-gray-600 mt-1">
                General inquiries:{" "}
                <a
                  href="mailto:support@seizn.com"
                  className="text-pink-600 hover:text-pink-700 underline"
                >
                  support@seizn.com
                </a>
              </p>
            </div>
            <p className="text-gray-600 leading-relaxed mt-4">
              We will respond to all privacy-related inquiries within 30 days.
              For urgent security concerns, please include &quot;URGENT&quot; in
              your email subject line.
            </p>
          </section>
        </div>

        {/* Footer Navigation */}
        <div className="mt-16 pt-8 border-t border-gray-200">
          <div className="flex flex-wrap gap-6 justify-center text-sm text-gray-500">
            <Link href="/" className="hover:text-gray-700 transition-colors">
              Home
            </Link>
            <Link href="/terms" className="hover:text-gray-700 transition-colors">
              Terms of Service
            </Link>
            <Link href="/docs" className="hover:text-gray-700 transition-colors">
              Documentation
            </Link>
            <Link href="/status" className="hover:text-gray-700 transition-colors">
              System Status
            </Link>
          </div>
          <p className="text-center text-gray-400 text-sm mt-6">
            &copy; {new Date().getFullYear()} Seizn. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}
