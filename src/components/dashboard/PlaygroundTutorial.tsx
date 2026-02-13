"use client";

import { useState, useEffect } from "react";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

const STORAGE_KEY = "seizn_playground_tutorial_completed";

interface Props {
  onTryExample: (query: string) => void;
}

export function PlaygroundTutorial({ onTryExample }: Props) {
  const { t } = useDashboardTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    const id = setTimeout(() => setIsVisible(completed !== "true"), 0);
    return () => clearTimeout(id);
  }, []);

  const tips = [
    {
      titleKey: "dashboard.playgroundTutorial.tips.welcome.title",
      descriptionKey: "dashboard.playgroundTutorial.tips.welcome.description",
      icon: "sparkles",
    },
    {
      titleKey: "dashboard.playgroundTutorial.tips.query.title",
      descriptionKey: "dashboard.playgroundTutorial.tips.query.description",
      icon: "search",
    },
    {
      titleKey: "dashboard.playgroundTutorial.tips.trace.title",
      descriptionKey: "dashboard.playgroundTutorial.tips.trace.description",
      icon: "chart",
    },
  ];

  const exampleQueries = [
    "What are the key features of this product?",
    "How do I set up the SDK?",
    "Show me examples of memory extraction",
  ];

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsVisible(false);
  };

  const handleTryExample = (query: string) => {
    onTryExample(query);
    // Mark first query step as complete
    localStorage.setItem("seizn_first_query", "true");
    if (typeof window !== "undefined" && window.seiznOnboarding) {
      window.seiznOnboarding.markComplete("first_query");
    }
  };

  if (!isVisible) {
    return null;
  }

  const tip = tips[currentTip];

  return (
    <div className="mb-6 glass-card border-2 border-cyan-500/20 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-cyan-500/10 to-teal-500/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {t("dashboard.playgroundTutorial.title")}
            </h3>
            <p className="text-sm text-gray-500">
              {t("dashboard.playgroundTutorial.subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-600 p-1"
          title={t("dashboard.playgroundTutorial.dismiss")}
        >
          <XIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Tip Carousel */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <div className="flex items-start gap-3">
            <TipIcon type={tip.icon} className="w-6 h-6 text-cyan-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900 mb-1">
                {t(tip.titleKey)}
              </h4>
              <p className="text-sm text-gray-600">
                {t(tip.descriptionKey)}
              </p>
            </div>
          </div>
          {/* Tip navigation */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {tips.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentTip(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentTip ? "bg-cyan-500" : "bg-gray-300"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Example Queries */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            {t("dashboard.playgroundTutorial.tryExamples")}
          </p>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((query, index) => (
              <button
                key={index}
                onClick={() => handleTryExample(query)}
                className="px-3 py-1.5 bg-gray-100 hover:bg-cyan-50 hover:text-cyan-700 text-sm text-gray-600 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <SearchIcon className="w-4 h-4" />
                {query.length > 30 ? query.slice(0, 30) + "..." : query}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {t("dashboard.playgroundTutorial.hint")}
        </span>
        <button
          onClick={handleDismiss}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t("dashboard.playgroundTutorial.gotIt")}
        </button>
      </div>
    </div>
  );
}

function TipIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "sparkles":
      return <SparklesIcon className={className} />;
    case "search":
      return <SearchIcon className={className} />;
    case "chart":
      return <ChartIcon className={className} />;
    default:
      return null;
  }
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
