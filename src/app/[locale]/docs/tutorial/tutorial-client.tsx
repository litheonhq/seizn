"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import type { Locale } from "@/i18n/config";
import { LanguageSwitcher } from "@/components/language-switcher";

type Dictionary = Record<string, unknown>;

interface Props {
  locale: Locale;
  dictionary: Dictionary;
}

// Get nested value from object using dot notation
function getNestedValue(obj: unknown, path: string): string | string[] | undefined {
  const keys = path.split(".");
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  if (typeof current === "string") return current;
  if (Array.isArray(current)) return current as string[];
  return undefined;
}

// Replace {param} placeholders with values
function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;

  return str.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key]?.toString() ?? `{${key}}`;
  });
}

// Copy button component with animation
function CopyButton({
  text: _text,
  copiedText,
  defaultText,
  onCopy,
  isCopied,
  size = "default",
}: {
  text: string;
  copiedText: string;
  defaultText: string;
  onCopy: () => void;
  isCopied: boolean;
  size?: "default" | "small";
}) {

  const baseClasses = size === "small"
    ? "px-2 py-1 text-xs"
    : "px-3 py-1.5 text-sm";

  return (
    <button
      onClick={onCopy}
      className={`${baseClasses} bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg transition-all duration-200 flex items-center gap-1.5`}
      aria-label={isCopied ? copiedText : defaultText}
    >
      {isCopied ? (
        <>
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-400">{copiedText}</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>{defaultText}</span>
        </>
      )}
    </button>
  );
}

// Code block with syntax highlighting colors
function CodeBlock({
  code,
  language,
  copyText,
  copiedText,
}: {
  code: string;
  language: string;
  copyText: string;
  copiedText: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  return (
    <div className="relative group bg-zinc-100 dark:bg-zinc-900 rounded-lg overflow-hidden">
      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton
          text={code}
          copiedText={copiedText}
          defaultText={copyText}
          onCopy={handleCopy}
          isCopied={copied}
          size="small"
        />
      </div>
      <div className="absolute top-3 left-3 text-xs text-zinc-500 font-mono">{language}</div>
      <pre className="pt-10 pb-4 px-4 overflow-x-auto">
        <code className="text-sm text-zinc-700 dark:text-zinc-300 font-mono">{code}</code>
      </pre>
    </div>
  );
}

// Step component with interactive checkbox
function TutorialStep({
  stepNumber,
  title,
  time,
  description,
  children,
  isCompleted,
  onToggle,
}: {
  stepNumber: number;
  title: string;
  time: string;
  description: string;
  children: React.ReactNode;
  isCompleted: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`border rounded-xl transition-all duration-300 ${
        isCompleted
          ? "bg-emerald-500/5 border-emerald-500/30"
          : "bg-zinc-100 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
      }`}
    >
      {/* Step Header */}
      <button
        onClick={onToggle}
        className="w-full p-6 flex items-start gap-4 text-left"
        aria-pressed={isCompleted}
      >
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
            isCompleted
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
              : "bg-zinc-200 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700"
          }`}
        >
          {isCompleted ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <span className="text-sm font-bold">{stepNumber}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">{title}</h3>
            <span className="text-xs text-zinc-500 bg-zinc-200 dark:bg-zinc-800 px-2.5 py-1 rounded-full font-medium">
              {time}
            </span>
          </div>
          <p className="text-zinc-600 dark:text-zinc-400 text-sm leading-relaxed">{description}</p>
        </div>
        <div className="shrink-0 mt-1">
          <div className={`w-6 h-6 rounded border-2 transition-colors ${
            isCompleted ? "bg-emerald-500 border-emerald-500" : "border-zinc-400 dark:border-zinc-600"
          }`}>
            {isCompleted && (
              <svg className="w-full h-full text-white p-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      </button>

      {/* Step Content */}
      <div className="px-6 pb-6 pt-0">
        <div className="ml-14">
          {children}
        </div>
      </div>
    </div>
  );
}

export function TutorialClient({ locale, dictionary }: Props) {
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<Record<number, number>>({});

  const t = (key: string, params?: Record<string, string | number>): string => {
    const value = getNestedValue(dictionary, key);
    if (!value || Array.isArray(value)) return key;
    return interpolate(value, params);
  };

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

  const progress = Math.round((completedSteps.size / 5) * 100);
  const currentYear = new Date().getFullYear();

  // Code snippets
  const installCode = {
    npm: "npm install seizn",
    pip: "pip install seizn",
    curl: "# No installation needed - use curl directly",
  };

  const saveMemoryCode = {
    typescript: `import { Seizn } from 'seizn';

const client = new Seizn({ apiKey: process.env.SEIZN_API_KEY });

// Save a memory
const memory = await client.add({
  content: "User prefers dark mode and concise responses",
  memory_type: "preference",
  tags: ["ui", "communication"]
});

console.log('Memory saved:', memory.id);`,
    python: `from seizn import Seizn

client = Seizn(api_key=os.environ["SEIZN_API_KEY"])

# Save a memory
memory = client.add(
    content="User prefers dark mode and concise responses",
    memory_type="preference",
    tags=["ui", "communication"]
)

print(f"Memory saved: {memory.id}")`,
    curl: `curl -X POST https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "User prefers dark mode and concise responses",
    "memory_type": "preference",
    "tags": ["ui", "communication"]
  }'`,
  };

  const searchMemoryCode = {
    typescript: `// Search for relevant memories
const results = await client.search({
  query: "What are the user's UI preferences?",
  limit: 5,
  threshold: 0.7
});

// Use memories in your AI prompt
for (const memory of results) {
  console.log(\`[\${memory.similarity.toFixed(2)}] \${memory.content}\`);
}`,
    python: `# Search for relevant memories
results = client.search(
    query="What are the user's UI preferences?",
    limit=5,
    threshold=0.7
)

# Use memories in your AI prompt
for memory in results:
    print(f"[{memory.similarity:.2f}] {memory.content}")`,
    curl: `curl "https://seizn.com/api/memories?query=user%20preferences&limit=5" \\
  -H "x-api-key: YOUR_API_KEY"`,
  };

  const expectedOutput = `{
  "success": true,
  "results": [
    {
      "id": "mem_a1b2c3d4e5f6",
      "content": "User prefers dark mode and concise responses",
      "memory_type": "preference",
      "tags": ["ui", "communication"],
      "similarity": 0.94,
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "count": 1,
  "query_time_ms": 47
}`;

  const tabs = ["TypeScript", "Python", "curl"];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={`/${locale}`} className="text-xl font-bold text-zinc-900 dark:text-white">
              Seizn<span className="text-emerald-500 dark:text-emerald-400">.</span>
            </Link>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <Link href={`/${locale}/docs`} className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              Docs
            </Link>
            <span className="text-zinc-400 dark:text-zinc-600">/</span>
            <span className="text-zinc-900 dark:text-white">{t("docs.tutorialPage.breadcrumb")}</span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher currentLocale={locale} />
            <Link
              href="/dashboard/keys"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {t("docs.tutorialPage.getApiKey")}
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-3 mb-6">
            <span className="px-4 py-1.5 bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 text-sm font-semibold rounded-full">
              {t("docs.tutorialPage.badge")}
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">|</span>
            <span className="text-zinc-500 dark:text-zinc-400 text-sm">{t("docs.tutorialPage.noCreditCard")}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-white mb-4">
            {t("docs.tutorialPage.title")}
          </h1>
          <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            {t("docs.tutorialPage.subtitle")}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-10 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zinc-900 dark:text-white">{t("docs.tutorialPage.progress")}</span>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">{completedSteps.size} / 5 {t("docs.tutorialPage.stepsLabel")}</span>
            </div>
            <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{progress}%</span>
          </div>
          <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-6">
          {/* Step 1: Get API Key */}
          <TutorialStep
            stepNumber={1}
            title={t("docs.tutorialPage.steps.step1.title")}
            time={t("docs.tutorialPage.steps.step1.time")}
            description={t("docs.tutorialPage.steps.step1.description")}
            isCompleted={completedSteps.has(0)}
            onToggle={() => toggleStep(0)}
          >
            <div className="space-y-4">
              <div className="p-4 bg-zinc-200/50 dark:bg-zinc-800/50 rounded-lg border border-zinc-300 dark:border-zinc-700">
                <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <li>{t("docs.tutorialPage.steps.step1.instruction1")}</li>
                  <li>{t("docs.tutorialPage.steps.step1.instruction2")}</li>
                  <li>{t("docs.tutorialPage.steps.step1.instruction3")}</li>
                </ol>
              </div>
              <Link
                href="/dashboard/keys"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                {t("docs.tutorialPage.steps.step1.actionLabel")}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </TutorialStep>

          {/* Step 2: Install SDK */}
          <TutorialStep
            stepNumber={2}
            title={t("docs.tutorialPage.steps.step2.title")}
            time={t("docs.tutorialPage.steps.step2.time")}
            description={t("docs.tutorialPage.steps.step2.description")}
            isCompleted={completedSteps.has(1)}
            onToggle={() => toggleStep(1)}
          >
            <div className="space-y-3">
              <div className="flex gap-2 mb-4">
                {["npm", "pip", "curl"].map((tab, idx) => (
                  <button
                    key={tab}
                    onClick={() => setTabIndex(2, idx)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      getTabIndex(2) === idx
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <CodeBlock
                code={getTabIndex(2) === 0 ? installCode.npm : getTabIndex(2) === 1 ? installCode.pip : installCode.curl}
                language={getTabIndex(2) === 0 ? "bash" : getTabIndex(2) === 1 ? "bash" : "bash"}
                copyText={t("docs.tutorialPage.copy")}
                copiedText={t("docs.tutorialPage.copied")}
              />
            </div>
          </TutorialStep>

          {/* Step 3: Save Memory */}
          <TutorialStep
            stepNumber={3}
            title={t("docs.tutorialPage.steps.step3.title")}
            time={t("docs.tutorialPage.steps.step3.time")}
            description={t("docs.tutorialPage.steps.step3.description")}
            isCompleted={completedSteps.has(2)}
            onToggle={() => toggleStep(2)}
          >
            <div className="space-y-3">
              <div className="flex gap-2 mb-4">
                {tabs.map((tab, idx) => (
                  <button
                    key={tab}
                    onClick={() => setTabIndex(3, idx)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      getTabIndex(3) === idx
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <CodeBlock
                code={getTabIndex(3) === 0 ? saveMemoryCode.typescript : getTabIndex(3) === 1 ? saveMemoryCode.python : saveMemoryCode.curl}
                language={getTabIndex(3) === 0 ? "typescript" : getTabIndex(3) === 1 ? "python" : "bash"}
                copyText={t("docs.tutorialPage.copy")}
                copiedText={t("docs.tutorialPage.copied")}
              />
            </div>
          </TutorialStep>

          {/* Step 4: Search Memory */}
          <TutorialStep
            stepNumber={4}
            title={t("docs.tutorialPage.steps.step4.title")}
            time={t("docs.tutorialPage.steps.step4.time")}
            description={t("docs.tutorialPage.steps.step4.description")}
            isCompleted={completedSteps.has(3)}
            onToggle={() => toggleStep(3)}
          >
            <div className="space-y-3">
              <div className="flex gap-2 mb-4">
                {tabs.map((tab, idx) => (
                  <button
                    key={tab}
                    onClick={() => setTabIndex(4, idx)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      getTabIndex(4) === idx
                        ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                        : "bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <CodeBlock
                code={getTabIndex(4) === 0 ? searchMemoryCode.typescript : getTabIndex(4) === 1 ? searchMemoryCode.python : searchMemoryCode.curl}
                language={getTabIndex(4) === 0 ? "typescript" : getTabIndex(4) === 1 ? "python" : "bash"}
                copyText={t("docs.tutorialPage.copy")}
                copiedText={t("docs.tutorialPage.copied")}
              />
            </div>
          </TutorialStep>

          {/* Step 5: Verify Results */}
          <TutorialStep
            stepNumber={5}
            title={t("docs.tutorialPage.steps.step5.title")}
            time={t("docs.tutorialPage.steps.step5.time")}
            description={t("docs.tutorialPage.steps.step5.description")}
            isCompleted={completedSteps.has(4)}
            onToggle={() => toggleStep(4)}
          >
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">{t("docs.tutorialPage.steps.step5.hint")}</p>
              <CodeBlock
                code={expectedOutput}
                language="json"
                copyText={t("docs.tutorialPage.copy")}
                copiedText={t("docs.tutorialPage.copied")}
              />
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-emerald-400">{t("docs.tutorialPage.steps.step5.successTitle")}</p>
                    <p className="text-sm text-emerald-300/80 mt-1">{t("docs.tutorialPage.steps.step5.successDescription")}</p>
                  </div>
                </div>
              </div>
            </div>
          </TutorialStep>
        </div>

        {/* Completion Banner */}
        {progress === 100 && (
          <div className="mt-12 p-8 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/30 rounded-2xl text-center animate-fade-in">
            <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/30">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-3">{t("docs.tutorialPage.completion.title")}</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-8 max-w-md mx-auto">
              {t("docs.tutorialPage.completion.description")}
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link
                href={`/${locale}/docs`}
                className="px-6 py-3 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium rounded-lg transition-colors"
              >
                {t("docs.tutorialPage.completion.readDocs")}
              </Link>
              <Link
                href="/dashboard"
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors"
              >
                {t("docs.tutorialPage.completion.goToDashboard")}
              </Link>
            </div>
          </div>
        )}

        {/* Next Steps */}
        <div className="mt-16">
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">{t("docs.tutorialPage.nextSteps.title")}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link href={`/${locale}/docs#endpoints`} className="p-6 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500/30 transition-all group">
              <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {t("docs.tutorialPage.nextSteps.apiReference.title")}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                {t("docs.tutorialPage.nextSteps.apiReference.description")}
              </p>
            </Link>

            <Link href={`/${locale}/docs#sdks`} className="p-6 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500/30 transition-all group">
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-500 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {t("docs.tutorialPage.nextSteps.sdkExamples.title")}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                {t("docs.tutorialPage.nextSteps.sdkExamples.description")}
              </p>
            </Link>

            <Link href={`/${locale}/docs/faq`} className="p-6 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl hover:border-emerald-500/30 transition-all group">
              <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                {t("docs.tutorialPage.nextSteps.faq.title")}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                {t("docs.tutorialPage.nextSteps.faq.description")}
              </p>
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-8 mt-16">
        <div className="max-w-4xl mx-auto px-6 text-center text-zinc-500 text-sm">
          {t("docs.footer.copyright", { year: currentYear })}
        </div>
      </footer>
    </div>
  );
}
