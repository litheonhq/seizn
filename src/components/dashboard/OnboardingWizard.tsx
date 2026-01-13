"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ttfsEvents } from "@/lib/analytics";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  action: {
    label: string;
    href: string;
    external?: boolean;
  };
  checkCompleted: () => Promise<boolean>;
}

interface Props {
  userId: string;
}

export function OnboardingWizard({ userId }: Props) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const steps: OnboardingStep[] = [
    {
      id: "api_key",
      title: "Create API Key",
      description: "Generate your first API key to authenticate requests",
      action: {
        label: "Create Key",
        href: "/dashboard/keys",
      },
      checkCompleted: async () => {
        const res = await fetch("/api/keys");
        const data = await res.json();
        return data.success && data.keys?.length > 0;
      },
    },
    {
      id: "demo_query",
      title: "Make Your First Query",
      description: "Try the demo query or make an API request",
      action: {
        label: "Try Demo",
        href: "/docs#quickstart",
      },
      checkCompleted: async () => {
        // Check if user has any API calls
        const res = await fetch("/api/dashboard/stats");
        const data = await res.json();
        return data.success && data.stats?.apiCalls?.today > 0;
      },
    },
    {
      id: "view_trace",
      title: "View a Trace",
      description: "Understand how search works with full tracing",
      action: {
        label: "View Traces",
        href: "/dashboard/usage",
      },
      checkCompleted: async () => {
        // For now, check if they've viewed the usage page
        // In production, track actual trace views
        return localStorage.getItem("seizn_trace_viewed") === "true";
      },
    },
    {
      id: "install_sdk",
      title: "Install SDK",
      description: "Add Seizn to your project with npm or pip",
      action: {
        label: "View SDKs",
        href: "/docs#sdks",
      },
      checkCompleted: async () => {
        return localStorage.getItem("seizn_sdk_copied") === "true";
      },
    },
  ];

  // Check completed steps on mount
  useEffect(() => {
    const checkSteps = async () => {
      const completed = new Set<string>();

      for (const step of steps) {
        try {
          const isComplete = await step.checkCompleted();
          if (isComplete) {
            completed.add(step.id);
          }
        } catch (error) {
          console.error(`Error checking step ${step.id}:`, error);
        }
      }

      setCompletedSteps(completed);
      setIsLoading(false);

      // Check if all steps completed
      if (completed.size === steps.length) {
        ttfsEvents.onboardingCompleted();
      }
    };

    // Check if dismissed
    const dismissed = localStorage.getItem(`seizn_onboarding_dismissed_${userId}`);
    if (dismissed === "true") {
      setIsDismissed(true);
      setIsLoading(false);
      return;
    }

    checkSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // steps is static and doesn't need to be a dependency

  const handleDismiss = () => {
    localStorage.setItem(`seizn_onboarding_dismissed_${userId}`, "true");
    ttfsEvents.onboardingDismissed(completedSteps.size, steps.length);
    setIsDismissed(true);
  };

  const handleStepClick = (step: OnboardingStep, index: number) => {
    if (!completedSteps.has(step.id)) {
      ttfsEvents.onboardingStepCompleted(step.id, index + 1);
    }
  };

  // Mark step as complete (for client-side tracking)
  const markStepComplete = (stepId: string) => {
    if (stepId === "view_trace") {
      localStorage.setItem("seizn_trace_viewed", "true");
    } else if (stepId === "install_sdk") {
      localStorage.setItem("seizn_sdk_copied", "true");
    }
    setCompletedSteps((prev) => new Set([...prev, stepId]));
  };

  // Export function for external use
  if (typeof window !== "undefined") {
    (window as Window & { seiznOnboarding?: { markComplete: (id: string) => void } }).seiznOnboarding = {
      markComplete: markStepComplete,
    };
  }

  if (isDismissed || isLoading) {
    return null;
  }

  const completionPercentage = Math.round((completedSteps.size / steps.length) * 100);
  const allComplete = completedSteps.size === steps.length;

  if (allComplete) {
    return null; // Hide wizard when all complete
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden mb-6 border-2 border-emerald-500/20">
      {/* Header */}
      <div
        className="p-4 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 cursor-pointer flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            <RocketIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Get Started with Seizn</h3>
            <p className="text-sm text-gray-500">
              {completedSteps.size}/{steps.length} steps completed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress Ring */}
          <div className="relative w-12 h-12">
            <svg className="w-12 h-12 transform -rotate-90">
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 20}`}
                strokeDashoffset={`${2 * Math.PI * 20 * (1 - completionPercentage / 100)}`}
                className="text-emerald-500 transition-all duration-500"
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
              {completionPercentage}%
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="text-gray-400 hover:text-gray-600 p-1"
            title="Dismiss"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Steps */}
      {isExpanded && (
        <div className="p-4 space-y-3">
          {steps.map((step, index) => {
            const isComplete = completedSteps.has(step.id);

            return (
              <div
                key={step.id}
                className={`flex items-center gap-4 p-3 rounded-xl transition-colors ${
                  isComplete
                    ? "bg-emerald-50"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                {/* Step Number / Check */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isComplete
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {isComplete ? (
                    <CheckIcon className="w-5 h-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium ${
                      isComplete ? "text-emerald-700" : "text-gray-900"
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {step.description}
                  </p>
                </div>

                {/* Action Button */}
                {!isComplete && (
                  <Link
                    href={step.action.href}
                    onClick={() => handleStepClick(step, index)}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0"
                  >
                    {step.action.label}
                  </Link>
                )}
              </div>
            );
          })}

          {/* Skip Link */}
          <div className="text-center pt-2">
            <button
              onClick={handleDismiss}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              I&apos;ll do this later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Icons
function RocketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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
