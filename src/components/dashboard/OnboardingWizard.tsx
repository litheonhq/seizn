"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ttfsEvents } from "@/lib/analytics";
import {
  dismissOnboarding,
  isOnboardingDismissed,
  isOnboardingStepStoredComplete,
  markOnboardingStepComplete,
  subscribeToOnboardingStepCompleted,
} from "@/lib/onboarding/progress";
import { useDashboardTranslation } from "@/contexts/DashboardLocaleContext";

type StepIconType = "org" | "key" | "sdk" | "query" | "trace";
type SdkType = "npm" | "pip" | "curl";

interface OnboardingStep {
  id: SeiznOnboardingStepId;
  titleKey: string;
  descriptionKey: string;
  iconType: StepIconType;
  action: {
    labelKey: string;
    href?: string;
  };
}

const STEPS: OnboardingStep[] = [
  {
    id: "create_org",
    titleKey: "dashboard.onboarding.steps.createOrg.title",
    descriptionKey: "dashboard.onboarding.steps.createOrg.description",
    iconType: "org",
    action: {
      labelKey: "dashboard.onboarding.steps.createOrg.action",
      href: "/dashboard/organizations",
    },
  },
  {
    id: "api_key",
    titleKey: "dashboard.onboarding.steps.apiKey.title",
    descriptionKey: "dashboard.onboarding.steps.apiKey.description",
    iconType: "key",
    action: {
      labelKey: "dashboard.onboarding.steps.apiKey.action",
      href: "/dashboard/keys",
    },
  },
  {
    id: "install_sdk",
    titleKey: "dashboard.onboarding.steps.installSdk.title",
    descriptionKey: "dashboard.onboarding.steps.installSdk.description",
    iconType: "sdk",
    action: {
      labelKey: "dashboard.onboarding.steps.installSdk.action",
    },
  },
  {
    id: "first_query",
    titleKey: "dashboard.onboarding.steps.firstQuery.title",
    descriptionKey: "dashboard.onboarding.steps.firstQuery.description",
    iconType: "query",
    action: {
      labelKey: "dashboard.onboarding.steps.firstQuery.action",
      href: "/dashboard/playground",
    },
  },
  {
    id: "view_trace",
    titleKey: "dashboard.onboarding.steps.viewTrace.title",
    descriptionKey: "dashboard.onboarding.steps.viewTrace.description",
    iconType: "trace",
    action: {
      labelKey: "dashboard.onboarding.steps.viewTrace.action",
      href: "/dashboard/playground",
    },
  },
];

interface OnboardingWizardProps {
  userId: string;
  onStartTour?: () => void;
}

export function OnboardingWizard({ userId, onStartTour }: OnboardingWizardProps) {
  const { t, isLoading: translationLoading } = useDashboardTranslation();
  const [completedSteps, setCompletedSteps] = useState<Set<SeiznOnboardingStepId>>(new Set());
  const [isLoading, setIsLoading] = useState(() => !isOnboardingDismissed(userId));
  const [isDismissed, setIsDismissed] = useState(() => isOnboardingDismissed(userId));
  const [isExpanded, setIsExpanded] = useState(true);
  const [showSdkModal, setShowSdkModal] = useState(false);
  const [copiedSdk, setCopiedSdk] = useState<SdkType | null>(null);
  const completionTrackedRef = useRef(false);

  const markStepComplete = useCallback((stepId: SeiznOnboardingStepId) => {
    markOnboardingStepComplete(stepId);
    setCompletedSteps((prev) => {
      if (prev.has(stepId)) {
        return prev;
      }
      return new Set([...prev, stepId]);
    });
  }, []);

  useEffect(() => {
    if (isDismissed) {
      return;
    }

    let cancelled = false;

    const checkSteps = async () => {
      const completed = new Set<SeiznOnboardingStepId>();

      if (isOnboardingStepStoredComplete("install_sdk")) {
        completed.add("install_sdk");
      }

      if (isOnboardingStepStoredComplete("first_query")) {
        completed.add("first_query");
      }

      if (isOnboardingStepStoredComplete("view_trace")) {
        completed.add("view_trace");
      }

      if (isOnboardingStepStoredComplete("create_org")) {
        completed.add("create_org");
      }

      if (isOnboardingStepStoredComplete("api_key")) {
        completed.add("api_key");
      }

      try {
        const orgRes = await fetch("/api/organizations", { cache: "no-store" });
        const orgData = await orgRes.json();
        if (orgRes.ok && orgData.success && orgData.organizations?.length > 0) {
          completed.add("create_org");
        }
      } catch {
        // Local storage fallback already applied above.
      }

      try {
        const keyRes = await fetch("/api/dashboard/keys", { cache: "no-store" });
        const keyData = await keyRes.json();
        if (keyRes.ok && keyData.success && keyData.keys?.length > 0) {
          completed.add("api_key");
        }
      } catch {
        // Local storage fallback already applied above.
      }

      try {
        const statsRes = await fetch("/api/dashboard/stats", { cache: "no-store" });
        const statsData = await statsRes.json();
        if (statsRes.ok && statsData.success && (statsData.stats?.apiCalls?.today ?? 0) > 0) {
          completed.add("first_query");
        }
      } catch {
        // Local storage fallback already applied above.
      }

      if (!cancelled) {
        setCompletedSteps(completed);
        setIsLoading(false);
      }
    };

    void checkSteps();

    return () => {
      cancelled = true;
    };
  }, [isDismissed, userId]);

  useEffect(() => {
    const unsubscribe = subscribeToOnboardingStepCompleted((stepId) => {
      setCompletedSteps((prev) => {
        if (prev.has(stepId)) {
          return prev;
        }
        return new Set([...prev, stepId]);
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleOrganizationsChanged = () => {
      markStepComplete("create_org");
    };

    window.addEventListener("seizn:organizations-changed", handleOrganizationsChanged);
    return () =>
      window.removeEventListener("seizn:organizations-changed", handleOrganizationsChanged);
  }, [markStepComplete]);

  useEffect(() => {
    window.seiznOnboarding = {
      markComplete: markStepComplete,
    };

    return () => {
      delete window.seiznOnboarding;
    };
  }, [markStepComplete]);

  useEffect(() => {
    if (completedSteps.size !== STEPS.length || completionTrackedRef.current) {
      return;
    }

    completionTrackedRef.current = true;
    ttfsEvents.onboardingCompleted();
  }, [completedSteps]);

  const handleDismiss = useCallback(() => {
    dismissOnboarding(userId);
    ttfsEvents.onboardingDismissed(completedSteps.size, STEPS.length);
    setIsDismissed(true);
  }, [completedSteps.size, userId]);

  const handleStepClick = useCallback(
    (step: OnboardingStep, index: number) => {
      if (!completedSteps.has(step.id)) {
        ttfsEvents.onboardingStepCompleted(step.id, index + 1);
      }
    },
    [completedSteps]
  );

  const handleCopySdk = useCallback(
    async (sdk: SdkType, command: string) => {
      try {
        await navigator.clipboard.writeText(command);
        setCopiedSdk(sdk);
        markStepComplete("install_sdk");
        ttfsEvents.sdkInstallCopy(sdk);
        setTimeout(() => setCopiedSdk(null), 2000);
      } catch {
        // Clipboard failure is non-fatal.
      }
    },
    [markStepComplete]
  );

  const completionPercentage = useMemo(
    () => Math.round((completedSteps.size / STEPS.length) * 100),
    [completedSteps.size]
  );

  const nextStepIndex = useMemo(
    () => STEPS.findIndex((step) => !completedSteps.has(step.id)),
    [completedSteps]
  );

  if (isDismissed || completedSteps.size === STEPS.length) {
    return null;
  }

  if (isLoading || translationLoading) {
    return (
      <div className="szn-card rounded-lg overflow-hidden mb-6 border-2 border-[var(--ink-900)]/20 animate-pulse">
        <div className="p-4 bg-[var(--ink-900)]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--ink-200)]" />
            <div className="space-y-2">
              <div className="h-4 w-40 bg-[var(--ink-200)] rounded" />
              <div className="h-3 w-24 bg-[var(--ink-200)] rounded" />
            </div>
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl bg-[var(--ink-50)]">
              <div className="w-8 h-8 rounded-full bg-[var(--ink-200)]" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-32 bg-[var(--ink-200)] rounded" />
                <div className="h-3 w-48 bg-[var(--ink-200)] rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="szn-card rounded-lg overflow-hidden mb-6 border-2 border-[var(--ink-900)]/20">
        <div
          className="p-4 bg-[var(--ink-900)]/10 cursor-pointer flex items-center justify-between"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--ink-900)] flex items-center justify-center">
              <RocketIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--ink-900)]">{t("dashboard.onboarding.title")}</h3>
              <p className="text-sm text-[var(--ink-600)]">
                {t("dashboard.onboarding.progress", {
                  completed: completedSteps.size,
                  total: STEPS.length,
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-12 h-12">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                  className="text-[var(--ink-200)]"
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
                  className="text-[var(--ink-900)] transition-all duration-500"
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[var(--ink-900)]">
                {completionPercentage}%
              </span>
            </div>
            {onStartTour && (
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  onStartTour();
                }}
                className="text-[var(--ink-900)] hover:text-[var(--ink-900)]/80 p-1"
                title={t("dashboard.onboarding.takeTour")}
              >
                <PlayIcon className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={(event) => {
                event.stopPropagation();
                handleDismiss();
              }}
              className="text-[var(--ink-500)] hover:text-[var(--ink-600)] p-1"
              title={t("dashboard.onboarding.dismiss")}
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="p-4 space-y-3">
            {STEPS.map((step, index) => {
              const isComplete = completedSteps.has(step.id);
              const isNext = index === nextStepIndex;
              const actionClassName = `px-4 py-2 text-sm font-medium rounded-lg transition-colors flex-shrink-0 ${
                isNext
                  ? "bg-[var(--ink-900)] text-white hover:bg-[var(--ink-900)]/90"
                  : "bg-[var(--ink-900)] text-white hover:bg-[var(--ink-900)]/90"
              }`;

              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-4 p-3 rounded-xl transition-all ${
                    isComplete
                      ? "bg-[var(--signal-canon)]/10"
                      : isNext
                        ? "bg-[var(--ink-900)]/10 ring-2 ring-[var(--ink-900)]/30"
                        : "bg-[var(--ink-50)] hover:bg-[var(--ink-50)]"
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isComplete
                        ? "bg-[var(--signal-canon)] text-white"
                        : isNext
                          ? "bg-[var(--ink-900)] text-white"
                          : "bg-[var(--ink-200)] text-[var(--ink-600)]"
                    }`}
                  >
                    {isComplete ? (
                      <CheckIcon className="w-5 h-5" />
                    ) : (
                      <StepIcon type={step.iconType} className="w-5 h-5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-medium ${
                        isComplete
                          ? "text-[var(--signal-canon)]"
                          : isNext
                            ? "text-[var(--ink-900)]"
                            : "text-[var(--ink-900)]"
                      }`}
                    >
                      {t(step.titleKey)}
                    </p>
                    <p className="text-sm text-[var(--ink-600)] truncate">{t(step.descriptionKey)}</p>
                  </div>

                  {!isComplete &&
                    (step.id === "install_sdk" ? (
                      <button
                        onClick={() => {
                          handleStepClick(step, index);
                          setShowSdkModal(true);
                        }}
                        className={actionClassName}
                      >
                        {t(step.action.labelKey)}
                      </button>
                    ) : (
                      <Link
                        href={step.action.href || "#"}
                        onClick={() => handleStepClick(step, index)}
                        className={actionClassName}
                      >
                        {t(step.action.labelKey)}
                      </Link>
                    ))}
                </div>
              );
            })}

            <div className="text-center pt-2">
              <button
                onClick={handleDismiss}
                className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-600)]"
              >
                {t("dashboard.onboarding.doLater")}
              </button>
            </div>
          </div>
        )}
      </div>

      {showSdkModal && (
        <SdkModal
          onClose={() => setShowSdkModal(false)}
          onCopy={handleCopySdk}
          copiedSdk={copiedSdk}
          t={t}
        />
      )}
    </>
  );
}

function SdkModal({
  onClose,
  onCopy,
  copiedSdk,
  t,
}: {
  onClose: () => void;
  onCopy: (sdk: SdkType, command: string) => void;
  copiedSdk: SdkType | null;
  t: (key: string) => string;
}) {
  const sdkOptions: { id: SdkType; name: string; command: string }[] = [
    { id: "npm", name: "JavaScript / TypeScript", command: "npm install seizn" },
    { id: "pip", name: "Python", command: "pip install seizn" },
    {
      id: "curl",
      name: "REST API (cURL)",
      command: `curl -X POST https://seizn.com/api/memories \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "test memory"}'`,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--ink-0)] rounded-lg max-w-lg w-full shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[var(--ink-200)]">
          <h3 className="text-lg font-semibold text-[var(--ink-900)]">
            {t("dashboard.onboarding.sdkModal.title")}
          </h3>
          <button onClick={onClose} className="text-[var(--ink-500)] hover:text-[var(--ink-600)] p-1">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-sm text-[var(--ink-600)]">
            {t("dashboard.onboarding.sdkModal.description")}
          </p>
          {sdkOptions.map((sdk) => (
            <div
              key={sdk.id}
              className="border border-[var(--ink-200)] rounded-xl p-4 hover:border-[var(--ink-900)]/50 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-[var(--ink-900)]">{sdk.name}</span>
                <button
                  onClick={() => onCopy(sdk.id, sdk.command)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    copiedSdk === sdk.id
                      ? "bg-[var(--ink-900)]/10 text-[var(--ink-900)]"
                      : "bg-[var(--ink-50)] text-[var(--ink-900)] hover:bg-[var(--ink-50)]"
                  }`}
                >
                  {copiedSdk === sdk.id ? (
                    <span className="flex items-center gap-1">
                      <CheckIcon className="w-4 h-4" />
                      {t("dashboard.onboarding.sdkModal.copied")}
                    </span>
                  ) : (
                    t("dashboard.onboarding.sdkModal.copy")
                  )}
                </button>
              </div>
              <pre className="bg-[var(--ink-900)] text-gray-100 p-3 rounded-lg text-sm overflow-x-auto">
                <code>{sdk.command}</code>
              </pre>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-[var(--ink-200)] bg-[var(--ink-50)] rounded-b-2xl">
          <div className="flex items-center justify-between">
            <Link
              href="/docs#sdks"
              className="text-sm text-[var(--ink-900)] hover:text-[var(--ink-900)]/80 font-medium"
            >
              {t("dashboard.onboarding.sdkModal.viewDocs")}
            </Link>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-[var(--ink-900)] text-white text-sm font-medium rounded-lg hover:bg-[var(--ink-900)]/90"
            >
              {t("dashboard.onboarding.sdkModal.done")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIcon({ type, className }: { type: StepIconType; className: string }) {
  const icons = {
    org: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
        />
      </svg>
    ),
    key: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        />
      </svg>
    ),
    sdk: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
        />
      </svg>
    ),
    query: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
    trace: (
      <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
  };

  return icons[type] || null;
}

function RocketIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlayIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
