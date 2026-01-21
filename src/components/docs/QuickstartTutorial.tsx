"use client";

import Link from "next/link";
import { useState } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

interface Step {
  title: string;
  time: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
  code?: {
    tabs: { lang: string; code: string }[];
  };
}

export function QuickstartTutorial() {
  const { t } = useDashboardTranslation();
  const [activeTab, setActiveTab] = useState<Record<number, number>>({});
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  const steps: Step[] = [
    {
      title: t("docs.quickstartTutorial.step1.title"),
      time: t("docs.quickstartTutorial.step1.time"),
      description: t("docs.quickstartTutorial.step1.description"),
      action: {
        label: t("docs.quickstartTutorial.step1.action"),
        href: "/dashboard/keys",
      },
    },
    {
      title: t("docs.quickstartTutorial.step2.title"),
      time: t("docs.quickstartTutorial.step2.time"),
      description: t("docs.quickstartTutorial.step2.description"),
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
      title: t("docs.quickstartTutorial.step3.title"),
      time: t("docs.quickstartTutorial.step3.time"),
      description: t("docs.quickstartTutorial.step3.description"),
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
      title: t("docs.quickstartTutorial.step4.title"),
      time: t("docs.quickstartTutorial.step4.time"),
      description: t("docs.quickstartTutorial.step4.description"),
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
      title: t("docs.quickstartTutorial.step5.title"),
      time: t("docs.quickstartTutorial.step5.time"),
      description: t("docs.quickstartTutorial.step5.description"),
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
      title: t("docs.quickstartTutorial.step6.title"),
      time: t("docs.quickstartTutorial.step6.time"),
      description: t("docs.quickstartTutorial.step6.description"),
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
    <section id="quickstart" className="mb-16">
      {/* Hero */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="px-3 py-1 bg-emerald-400/10 text-emerald-600 text-sm font-medium rounded-full">
            {t("docs.quickstartTutorial.badge")}
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500 text-sm">{t("docs.quickstartTutorial.noCreditCard")}</span>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          {t("docs.quickstartTutorial.title")}
        </h2>
        <p className="text-lg text-gray-500 max-w-2xl">
          {t("docs.quickstartTutorial.subtitle")}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">{t("docs.quickstartTutorial.progress")}</span>
          <span className="text-sm text-gray-500">{completedSteps.size} / {steps.length} {t("docs.quickstartTutorial.steps")}</span>
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
        <div className="mt-8 p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl text-center">
          <div className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("docs.quickstartTutorial.congratulations")}</h2>
          <p className="text-gray-500 mb-6">
            {t("docs.quickstartTutorial.completionText")}
          </p>
          <div className="flex items-center justify-center gap-4">
            <a
              href="#authentication"
              className="px-6 py-3 bg-gray-100 hover:bg-zinc-700 text-gray-900 font-medium rounded-lg transition-colors"
            >
              {t("docs.quickstartTutorial.continueReading")}
            </a>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-gray-900 font-medium rounded-lg transition-colors"
            >
              {t("docs.quickstartTutorial.goToDashboard")}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
