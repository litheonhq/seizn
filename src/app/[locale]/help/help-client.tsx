"use client";

import { useState } from "react";
import Link from "next/link";
import type { Locale } from "@/i18n/config";

interface HelpClientProps {
  locale: Locale;
  dictionary: Record<string, unknown>;
}

// Default help translations
const defaultHelp = {
  title: "Help Hub",
  subtitle: "Find answers, get support, and access resources.",
  search: { placeholder: "Search help...", noResults: "No results found" },
  sections: {
    support: {
      title: "Support Channels",
      description: "Get help from our team",
      email: { title: "Email Support", description: "Get help via email within 24 hours", action: "support@seizn.com" },
      discord: { title: "Discord Community", description: "Join our community for real-time help", action: "Join Discord" },
      github: { title: "GitHub Issues", description: "Report bugs and request features", action: "Open Issue" },
    },
    faq: { title: "Frequently Asked Questions", description: "Quick answers to common questions", viewAll: "View All FAQs" },
    status: {
      title: "System Status",
      description: "Check current system status and incidents",
      viewStatus: "View Status Page",
      operational: "All Systems Operational",
      degraded: "Degraded Performance",
      outage: "Service Outage",
    },
    billing: {
      title: "Billing & Plans",
      description: "Manage your subscription and payments",
      items: { plans: "View Plans", usage: "Check Usage", invoices: "Download Invoices", upgrade: "Upgrade Plan" },
    },
    docs: {
      title: "Documentation",
      description: "Popular documentation links",
      links: { quickstart: "Quickstart Guide", apiReference: "API Reference", sdks: "SDKs & Libraries", limits: "Limits & Billing", security: "Security" },
    },
  },
  contact: { title: "Still need help?", description: "Our support team is here to help you succeed.", cta: "Contact Support" },
};

// Sample FAQ data
const faqData = [
  {
    id: "api-key",
    question: "How do I get an API key?",
    answer: "You can get an API key by signing up for an account and navigating to the Dashboard > API Keys section. Click 'Create New Key' to generate a new API key.",
  },
  {
    id: "rate-limits",
    question: "What are the rate limits?",
    answer: "Rate limits vary by plan: Free (10 RPS), Plus (50 RPS), Pro (200 RPS), Enterprise (custom). See the Limits & Billing page for more details.",
  },
  {
    id: "billing-cycle",
    question: "When does billing occur?",
    answer: "Billing occurs on a monthly basis, starting from your subscription date. You can view your billing history and next payment date in the Dashboard.",
  },
  {
    id: "data-security",
    question: "How is my data secured?",
    answer: "All data is encrypted at rest and in transit using industry-standard encryption. We are SOC 2 Type II compliant and follow security best practices.",
  },
  {
    id: "cancel-subscription",
    question: "How do I cancel my subscription?",
    answer: "You can cancel your subscription anytime from Dashboard > Settings > Subscription. Your access will continue until the end of the current billing period.",
  },
];

export function HelpClient({ locale, dictionary }: HelpClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  // Get help translations with fallback
  const help = (dictionary.help as typeof defaultHelp) || defaultHelp;

  // Filter FAQs based on search
  const filteredFaqs = faqData.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-szn-bg">
      {/* Header */}
      <header className="bg-szn-card border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href={`/${locale}`} className="text-xl font-bold text-szn-text-1">
            Seizn
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href={`/${locale}/docs`} className="text-szn-text-2 hover:text-szn-text-1">
              Docs
            </Link>
            <Link href={`/${locale}/pricing`} className="text-szn-text-2 hover:text-szn-text-1">
              Pricing
            </Link>
            <Link href="/status" className="text-szn-text-2 hover:text-szn-text-1">
              Status
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-szn-accent/5 to-szn-card py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold text-szn-text-1 mb-4">{help.title}</h1>
          <p className="text-lg text-szn-text-2 mb-8">{help.subtitle}</p>

          {/* Search */}
          <div className="relative max-w-xl mx-auto">
            <input
              type="text"
              placeholder={help.search.placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 pl-12 rounded-xl border border-szn-border focus:outline-none focus:ring-2 focus:ring-szn-accent focus:border-transparent"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-szn-text-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Quick Links Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          {/* Support Channels */}
          <div className="bg-szn-card rounded-2xl border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-szn-text-1">{help.sections.support.title}</h2>
                <p className="text-sm text-szn-text-2">{help.sections.support.description}</p>
              </div>
            </div>
            <div className="space-y-3">
              <a
                href="mailto:support@seizn.com"
                className="flex items-center justify-between p-3 rounded-lg bg-szn-bg hover:bg-szn-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-szn-text-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm font-medium text-szn-text-1">{help.sections.support.email.title}</span>
                </div>
                <svg className="w-4 h-4 text-szn-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="https://discord.gg/seizn"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-szn-bg hover:bg-szn-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-szn-text-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
                  </svg>
                  <span className="text-sm font-medium text-szn-text-1">{help.sections.support.discord.title}</span>
                </div>
                <svg className="w-4 h-4 text-szn-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
              <a
                href="https://github.com/iruhana/seizn/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-szn-bg hover:bg-szn-surface transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-szn-text-2" viewBox="0 0 24 24" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span className="text-sm font-medium text-szn-text-1">{help.sections.support.github.title}</span>
                </div>
                <svg className="w-4 h-4 text-szn-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          {/* System Status */}
          <div className="bg-szn-card rounded-2xl border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-szn-text-1">{help.sections.status.title}</h2>
                <p className="text-sm text-szn-text-2">{help.sections.status.description}</p>
              </div>
            </div>
            <div className="p-4 rounded-xl bg-szn-accent/5 border border-szn-accent/30 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 bg-szn-accent/50 rounded-full animate-pulse" />
                <span className="text-sm font-medium text-szn-accent">{help.sections.status.operational}</span>
              </div>
            </div>
            <Link
              href="/status"
              className="flex items-center justify-center gap-2 w-full py-2.5 text-sm font-medium text-szn-accent bg-szn-accent/5 rounded-lg hover:bg-szn-accent/10 transition-colors"
            >
              {help.sections.status.viewStatus}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Billing & Plans */}
          <div className="bg-szn-card rounded-2xl border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-szn-text-1">{help.sections.billing.title}</h2>
                <p className="text-sm text-szn-text-2">{help.sections.billing.description}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Link
                href={`/${locale}/pricing`}
                className="flex items-center justify-between p-3 rounded-lg bg-szn-bg hover:bg-szn-surface transition-colors"
              >
                <span className="text-sm font-medium text-szn-text-1">{help.sections.billing.items.plans}</span>
                <svg className="w-4 h-4 text-szn-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href={`/${locale}/docs/limits`}
                className="flex items-center justify-between p-3 rounded-lg bg-szn-bg hover:bg-szn-surface transition-colors"
              >
                <span className="text-sm font-medium text-szn-text-1">{help.sections.billing.items.usage}</span>
                <svg className="w-4 h-4 text-szn-text-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>

        {/* Documentation Links */}
        <div className="bg-szn-card rounded-2xl border p-6 mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h2 className="font-semibold text-szn-text-1">{help.sections.docs.title}</h2>
              <p className="text-sm text-szn-text-2">{help.sections.docs.description}</p>
            </div>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            <Link
              href={`/${locale}/docs/quickstart`}
              className="flex flex-col items-center p-4 rounded-xl bg-szn-bg hover:bg-szn-accent/10 hover:border-szn-accent/30 border border-transparent transition-colors"
            >
              <svg className="w-6 h-6 text-szn-accent mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="text-sm font-medium text-szn-text-1">{help.sections.docs.links.quickstart}</span>
            </Link>
            <Link
              href={`/${locale}/docs/api`}
              className="flex flex-col items-center p-4 rounded-xl bg-szn-bg hover:bg-szn-accent/10 hover:border-szn-accent/30 border border-transparent transition-colors"
            >
              <svg className="w-6 h-6 text-szn-accent mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
              <span className="text-sm font-medium text-szn-text-1">{help.sections.docs.links.apiReference}</span>
            </Link>
            <Link
              href={`/${locale}/docs/sdks`}
              className="flex flex-col items-center p-4 rounded-xl bg-szn-bg hover:bg-szn-accent/10 hover:border-szn-accent/30 border border-transparent transition-colors"
            >
              <svg className="w-6 h-6 text-szn-accent mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm font-medium text-szn-text-1">{help.sections.docs.links.sdks}</span>
            </Link>
            <Link
              href={`/${locale}/docs/limits`}
              className="flex flex-col items-center p-4 rounded-xl bg-szn-bg hover:bg-szn-accent/10 hover:border-szn-accent/30 border border-transparent transition-colors"
            >
              <svg className="w-6 h-6 text-szn-accent mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span className="text-sm font-medium text-szn-text-1">{help.sections.docs.links.limits}</span>
            </Link>
            <Link
              href={`/${locale}/docs/security`}
              className="flex flex-col items-center p-4 rounded-xl bg-szn-bg hover:bg-szn-accent/10 hover:border-szn-accent/30 border border-transparent transition-colors"
            >
              <svg className="w-6 h-6 text-szn-accent mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-sm font-medium text-szn-text-1">{help.sections.docs.links.security}</span>
            </Link>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-szn-card rounded-2xl border p-6 mb-12">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-szn-accent/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-szn-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="font-semibold text-szn-text-1">{help.sections.faq.title}</h2>
                <p className="text-sm text-szn-text-2">{help.sections.faq.description}</p>
              </div>
            </div>
          </div>

          {filteredFaqs.length === 0 ? (
            <div className="text-center py-8 text-szn-text-2">
              <p>{help.search.noResults}</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredFaqs.map((faq) => (
                <div key={faq.id} className="py-4">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === faq.id ? null : faq.id)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <span className="font-medium text-szn-text-1">{faq.question}</span>
                    <svg
                      className={`w-5 h-5 text-szn-text-3 transition-transform ${
                        expandedFaq === faq.id ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {expandedFaq === faq.id && (
                    <p className="mt-3 text-szn-text-2 text-sm leading-relaxed">{faq.answer}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact CTA */}
        <div className="bg-gradient-to-r from-szn-accent to-szn-accent-2 rounded-2xl p-8 text-center text-white">
          <h2 className="text-2xl font-bold mb-2">{help.contact.title}</h2>
          <p className="text-szn-accent/20 mb-6">{help.contact.description}</p>
          <a
            href="mailto:support@seizn.com"
            className="inline-flex items-center gap-2 px-6 py-3 bg-szn-card text-szn-accent font-semibold rounded-lg hover:bg-szn-accent/10 transition-colors"
          >
            {help.contact.cta}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-szn-card border-t mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-szn-text-2">
          <p>&copy; {new Date().getFullYear()} Seizn. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
