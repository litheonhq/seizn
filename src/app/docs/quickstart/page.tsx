"use client";

import Link from "next/link";
import { useState } from "react";

const steps = [
  {
    title: "Get Your API Key",
    time: "30 seconds",
    description: "Sign up and generate your API key from the dashboard.",
    action: {
      label: "Go to Dashboard",
      href: "/dashboard/keys",
    },
    code: null,
  },
  {
    title: "Install the SDK",
    time: "30 seconds",
    description: "Install the Seizn SDK using your preferred package manager.",
    code: {
      tabs: [
        { lang: "npm", code: "npm install @seizn/spring" },
        { lang: "yarn", code: "yarn add @seizn/spring" },
        { lang: "pnpm", code: "pnpm add @seizn/spring" },
        { lang: "Python", code: "pip install seizn" },
      ],
    },
  },
  {
    title: "Initialize the Client",
    time: "1 minute",
    description: "Create a client instance with your API key.",
    code: {
      tabs: [
        {
          lang: "TypeScript",
          code: `import { SpringClient } from '@seizn/spring';

const spring = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY!,
});`,
        },
        {
          lang: "JavaScript",
          code: `const { SpringClient } = require('@seizn/spring');

const spring = new SpringClient({
  apiKey: process.env.SEIZN_API_KEY,
});`,
        },
        {
          lang: "Python",
          code: `from seizn import SeizClient

client = SeizClient(api_key="szn_your_api_key")`,
        },
      ],
    },
  },
  {
    title: "Add Your First Memory",
    time: "1 minute",
    description: "Store information that your AI can recall later.",
    code: {
      tabs: [
        {
          lang: "TypeScript",
          code: `// Add a user preference
await spring.add({
  content: "User prefers dark mode and minimal animations",
  type: "preference",
  tags: ["settings", "ui"],
});

// Add a fact
await spring.add({
  content: "User is a senior engineer at TechCorp",
  type: "fact",
  tags: ["profile", "work"],
});`,
        },
        {
          lang: "Python",
          code: `# Add a user preference
client.add(
    "User prefers dark mode and minimal animations",
    user_id="user123"
)

# Add with metadata
client.add(
    "User is a senior engineer at TechCorp",
    user_id="user123",
    metadata={"category": "profile"}
)`,
        },
      ],
    },
  },
  {
    title: "Search and Recall",
    time: "1 minute",
    description: "Retrieve relevant memories using natural language search.",
    code: {
      tabs: [
        {
          lang: "TypeScript",
          code: `// Search memories
const results = await spring.search({
  query: "What are the user's UI preferences?",
  topK: 5,
  threshold: 0.7,
});

console.log(results);
// [{ content: "User prefers dark mode...", similarity: 0.92 }]`,
        },
        {
          lang: "Python",
          code: `# Search memories
results = client.search(
    "What are the user's UI preferences?",
    user_id="user123",
    top_k=5
)

for r in results:
    print(f"{r.score:.2f}: {r.content}")`,
        },
      ],
    },
  },
  {
    title: "Use in Your AI",
    time: "1 minute",
    description: "Inject memories as context for personalized AI responses.",
    code: {
      tabs: [
        {
          lang: "TypeScript",
          code: `// Get relevant context for AI
const memories = await spring.recall("user preferences");

// Use with your AI (OpenAI example)
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    {
      role: "system",
      content: \`You know this about the user:\\n\${memories.map(m => m.content).join('\\n')}\`,
    },
    { role: "user", content: "Recommend a code editor setup" },
  ],
});

// AI response will be personalized based on stored memories`,
        },
        {
          lang: "Python",
          code: `# Get relevant context for AI
memories = client.search("user preferences", user_id="user123")

# Use with your AI (OpenAI example)
from openai import OpenAI
openai = OpenAI()

context = "\\n".join([m.content for m in memories])

response = openai.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": f"You know this about the user:\\n{context}"},
        {"role": "user", "content": "Recommend a code editor setup"},
    ],
)

# AI response will be personalized based on stored memories`,
        },
      ],
    },
  },
];

export default function QuickstartPage() {
  const [activeTab, setActiveTab] = useState<Record<number, number>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (index: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getTabIndex = (stepIndex: number) => activeTab[stepIndex] || 0;
  const setTabIndex = (stepIndex: number, tabIndex: number) =>
    setActiveTab((prev) => ({ ...prev, [stepIndex]: tabIndex }));

  const progress = Math.round((completedSteps.size / steps.length) * 100);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Seizn<span className="text-emerald-600">.</span>
            </Link>
            <span className="text-zinc-600">/</span>
            <Link href="/docs" className="text-gray-500 hover:text-gray-900 transition-colors">
              Docs
            </Link>
            <span className="text-zinc-600">/</span>
            <span className="text-gray-900">Quickstart</span>
          </div>
          <Link
            href="/dashboard/keys"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-medium rounded-lg transition-colors text-sm"
          >
            Get API Key
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-emerald-400/10 text-emerald-600 text-sm font-medium rounded-full">
              5 min tutorial
            </span>
            <span className="text-gray-400">•</span>
            <span className="text-gray-500 text-sm">No credit card required</span>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Get Started with Seizn
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl">
            Add persistent memory to your AI in under 5 minutes. Follow along and check off each step as you complete it.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Progress</span>
            <span className="text-sm text-gray-500">{completedSteps.size} / {steps.length} steps</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`border rounded-xl transition-colors ${
                completedSteps.has(index)
                  ? "bg-emerald-500/5 border-emerald-500/30"
                  : "bg-white border-gray-200"
              }`}
            >
              {/* Step Header */}
              <button
                onClick={() => toggleStep(index)}
                className="w-full p-6 flex items-start gap-4 text-left"
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                    completedSteps.has(index)
                      ? "bg-emerald-500 text-gray-900"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {completedSteps.has(index) ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {step.time}
                    </span>
                  </div>
                  <p className="text-gray-500 text-sm">{step.description}</p>
                </div>
              </button>

              {/* Step Content */}
              <div className="px-6 pb-6">
                {step.action && (
                  <Link
                    href={step.action.href}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-medium rounded-lg transition-colors text-sm"
                  >
                    {step.action.label}
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                )}

                {step.code && (
                  <div className="bg-gray-100 rounded-lg overflow-hidden">
                    {/* Code Tabs */}
                    {step.code.tabs.length > 1 && (
                      <div className="flex border-b border-gray-300">
                        {step.code.tabs.map((tab, tabIndex) => (
                          <button
                            key={tabIndex}
                            onClick={() => setTabIndex(index, tabIndex)}
                            className={`px-4 py-2 text-sm font-medium transition-colors ${
                              getTabIndex(index) === tabIndex
                                ? "text-emerald-600 border-b-2 border-emerald-400 -mb-px"
                                : "text-gray-500 hover:text-gray-900"
                            }`}
                          >
                            {tab.lang}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Code Block */}
                    <div className="p-4 relative">
                      {step.code.tabs.length === 1 && (
                        <div className="absolute top-3 right-3 text-xs text-gray-400">
                          {step.code.tabs[0].lang}
                        </div>
                      )}
                      <pre className="text-sm text-gray-700 overflow-x-auto">
                        <code>{step.code.tabs[getTabIndex(index)].code}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Completion */}
        {progress === 100 && (
          <div className="mt-12 p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Congratulations!</h2>
            <p className="text-gray-500 mb-6">
              You&apos;ve completed the quickstart. Your AI now has persistent memory.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/docs"
                className="px-6 py-3 bg-gray-100 hover:bg-zinc-700 text-gray-900 font-medium rounded-lg transition-colors"
              >
                Read the Docs
              </Link>
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-medium rounded-lg transition-colors"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <Link href="/docs#endpoints" className="p-6 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors group">
            <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
              API Reference
            </h3>
            <p className="text-gray-500 text-sm">
              Explore all endpoints and options for advanced use cases.
            </p>
          </Link>

          <Link href="/docs#sdks" className="p-6 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors group">
            <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
              SDK Examples
            </h3>
            <p className="text-gray-500 text-sm">
              Copy-paste examples for Python, TypeScript, and more.
            </p>
          </Link>

          <Link href="/docs#security" className="p-6 bg-white border border-gray-200 rounded-xl hover:border-gray-300 transition-colors group">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 group-hover:text-emerald-600 transition-colors">
              Security & Governance
            </h3>
            <p className="text-gray-500 text-sm">
              Learn about data security, key management, and compliance.
            </p>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-6 text-center text-gray-400 text-sm">
          © 2026 Seizn. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
