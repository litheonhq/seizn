"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckoutButton, PLAN_VARIANTS } from "@/components/checkout-button";

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
  }
}

export default function Home() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize Lemon Squeezy on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.createLemonSqueezy) {
      window.createLemonSqueezy();
    }
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus("loading");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setStatus("success");
    setEmail("");
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100" role="navigation" aria-label="Main navigation">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2" aria-label="Seizn Home">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-xl tracking-tight">Seizn</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-600 hover:text-black transition-colors">Features</a>
            <a href="#pricing" className="text-sm text-gray-600 hover:text-black transition-colors">Pricing</a>
            <a href="/docs" className="text-sm text-gray-600 hover:text-black transition-colors">Docs</a>
            <a href="/login" className="text-sm text-gray-600 hover:text-black transition-colors">Login</a>
            <a href="/login" className="text-sm bg-black text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors btn-hover-lift">
              Get Started
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-gray-600 hover:text-black transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 animate-fade-in">
            <div className="px-6 py-4 space-y-4">
              <a href="#features" className="block text-gray-600 hover:text-black transition-colors" onClick={() => setMobileMenuOpen(false)}>Features</a>
              <a href="#pricing" className="block text-gray-600 hover:text-black transition-colors" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
              <a href="/docs" className="block text-gray-600 hover:text-black transition-colors" onClick={() => setMobileMenuOpen(false)}>Docs</a>
              <a href="/login" className="block text-gray-600 hover:text-black transition-colors" onClick={() => setMobileMenuOpen(false)}>Login</a>
              <a href="/login" className="block w-full text-center bg-black text-white px-4 py-3 rounded-full hover:bg-gray-800 transition-colors" onClick={() => setMobileMenuOpen(false)}>
                Get Started
              </a>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-4 py-1.5 mb-8 animate-fade-in">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-600">Coming Q1 2026</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight text-gray-900 mb-6 animate-fade-in-up">
            Memory infrastructure
            <br />
            <span className="text-gray-400">for AI applications</span>
          </h1>

          {/* Subheadline */}
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed animate-fade-in-up animate-delay-100">
            Give your AI persistent memory. Seizn extracts, stores, and retrieves
            context automatically — so your AI remembers everything.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
            {status === "success" ? (
              <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-6 py-3 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>You&apos;re on the list!</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="flex-1 px-5 py-3 rounded-full border border-gray-200 focus:outline-none focus:border-gray-400 transition-colors text-gray-900"
                  required
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="px-6 py-3 rounded-full bg-black text-white font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {status === "loading" ? "Joining..." : "Join Waitlist"}
                </button>
              </form>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-12 text-center">
            <div>
              <div className="text-3xl font-semibold text-gray-900">90%</div>
              <div className="text-sm text-gray-500">Token Savings</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div>
              <div className="text-3xl font-semibold text-gray-900">&lt;50ms</div>
              <div className="text-sm text-gray-500">Retrieval Time</div>
            </div>
            <div className="w-px h-12 bg-gray-200" />
            <div>
              <div className="text-3xl font-semibold text-gray-900">99.9%</div>
              <div className="text-sm text-gray-500">Uptime SLA</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              Built for developers
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Simple APIs, powerful infrastructure. Add persistent memory to any AI in minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 card-hover">
              <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Smart Extraction</h3>
              <p className="text-gray-500 leading-relaxed">
                Automatically extracts key facts, preferences, and context from conversations using Claude AI.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 card-hover">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Instant Retrieval</h3>
              <p className="text-gray-500 leading-relaxed">
                Hybrid vector + graph search returns relevant memories in milliseconds, every time.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-white p-8 rounded-2xl border border-gray-100 card-hover">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Enterprise Security</h3>
              <p className="text-gray-500 leading-relaxed">
                End-to-end encryption, SOC 2 compliant, with granular access controls and audit logs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Code Preview Section */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              Simple integration
            </h2>
            <p className="text-gray-500">
              Add memory to your AI in just a few lines of code.
            </p>
          </div>

          <div className="bg-gray-900 rounded-2xl p-6 overflow-hidden">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
            <pre className="text-sm text-gray-300 overflow-x-auto">
              <code>{`import { Seizn } from '@seizn/sdk';

const seizn = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

// Add a memory
await seizn.add({
  content: "User prefers dark mode and lives in Seoul",
  userId: "user_123"
});

// Search memories
const memories = await seizn.search({
  query: "What are the user's preferences?",
  userId: "user_123"
});`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold text-gray-900 mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-gray-500">
              Start free, scale as you grow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 card-hover">
              <div className="text-sm font-medium text-gray-500 mb-2">Free</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">$0</div>
              <div className="text-sm text-gray-500 mb-6">Forever free</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  10,000 memories
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  1,000 API calls/mo
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Community support
                </li>
              </ul>
              <a href="/login" className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center">
                Get Started
              </a>
            </div>

            {/* Plus */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 card-hover">
              <div className="text-sm font-medium text-gray-500 mb-2">Plus</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">$9</div>
              <div className="text-sm text-gray-500 mb-6">per month</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  50,000 memories
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  10,000 API calls/mo
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Email support
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Basic analytics
                </li>
              </ul>
              <CheckoutButton
                variantId={PLAN_VARIANTS.plus}
                className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center"
              >
                Subscribe
              </CheckoutButton>
            </div>

            {/* Pro */}
            <div className="bg-black p-6 rounded-2xl relative card-hover">
              <div className="absolute top-4 right-4 bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">
                Popular
              </div>
              <div className="text-sm font-medium text-gray-400 mb-2">Pro</div>
              <div className="text-3xl font-semibold text-white mb-1">$29</div>
              <div className="text-sm text-gray-400 mb-6">per month</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  200,000 memories
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  50,000 API calls/mo
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Priority support
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Advanced analytics
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-300">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Webhooks
                </li>
              </ul>
              <CheckoutButton
                variantId={PLAN_VARIANTS.pro}
                className="block w-full py-3 rounded-full bg-white text-black font-medium hover:bg-gray-100 transition-colors text-center"
              >
                Subscribe
              </CheckoutButton>
            </div>

            {/* Enterprise */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 card-hover">
              <div className="text-sm font-medium text-gray-500 mb-2">Enterprise</div>
              <div className="text-3xl font-semibold text-gray-900 mb-1">Custom</div>
              <div className="text-sm text-gray-500 mb-6">Contact us</div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited memories
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Unlimited API calls
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Dedicated support
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Custom SLA
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  On-premise option
                </li>
              </ul>
              <a href="mailto:contact@seizn.com" className="block w-full py-3 rounded-full border border-gray-200 text-gray-900 font-medium hover:bg-gray-50 transition-colors text-center">
                Contact Sales
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100" role="contentinfo">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2" aria-label="Seizn Home">
            <div className="w-6 h-6 bg-black rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">S</span>
            </div>
            <span className="font-medium">Seizn</span>
          </Link>
          <div className="text-sm text-gray-500">
            © {new Date().getFullYear()} Seizn. All rights reserved.
          </div>
          <nav className="flex items-center gap-6" aria-label="Footer navigation">
            <a href="/privacy" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Privacy</a>
            <a href="/terms" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Terms</a>
            <a href="mailto:contact@seizn.com" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
